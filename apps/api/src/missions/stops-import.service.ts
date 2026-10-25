import { BadRequestException, Injectable } from '@nestjs/common';
import {
  importStopSchema,
  validateTimeWindow,
  type CreateStopInput,
  type ImportStopInput,
} from '@sira/shared';
import ExcelJS from 'exceljs';
import Papa from 'papaparse';

/**
 * Import d'arrets depuis un CSV ou un XLSX.
 *
 * Principe directeur : une ligne fautive n'annule pas l'import. Un dispatcheur
 * qui depose 45 courses et recoit « erreur ligne 12 » sans rien d'importe perd
 * sa matinee. On importe tout ce qui est valide et on rend un rapport ligne a
 * ligne de ce qui ne l'est pas.
 */

/** Au-dela, c'est un fichier qui n'a rien a faire ici. */
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 1000;

export interface ImportRowError {
  /** Numero de ligne tel que vu dans le tableur, en-tete comprise. */
  row: number;
  field: string;
  message: string;
}

export interface ParsedImport {
  stops: CreateStopInput[];
  errors: ImportRowError[];
  /** Colonnes du fichier qu'aucun champ connu ne reconnait. */
  ignoredColumns: string[];
}

/**
 * Synonymes acceptes pour chaque colonne, en francais et en anglais. Les
 * en-tetes reels viennent de tableurs saisis a la main : « Téléphone »,
 * « tel contact », « PHONE ». La normalisation retire accents, casse et
 * separateurs avant comparaison.
 */
const COLUMN_ALIASES: Record<keyof ImportStopInput, string[]> = {
  label: ['label', 'libelle', 'nom', 'name', 'client', 'destinataire'],
  lat: ['lat', 'latitude'],
  lon: ['lon', 'lng', 'long', 'longitude'],
  addressText: ['adresse', 'address', 'addresstext', 'adressetexte'],
  informalDescription: [
    'description',
    'descriptioninformelle',
    'informaldescription',
    'indication',
    'indications',
    'precisions',
  ],
  landmark: ['repere', 'pointdederepere', 'landmark'],
  contactName: ['contact', 'nomcontact', 'contactname'],
  contactPhone: ['telephone', 'tel', 'phone', 'contactphone', 'telcontact', 'numero'],
  timeWindowStart: ['debut', 'heuredebut', 'fenetredebut', 'timewindowstart', 'start'],
  timeWindowEnd: ['fin', 'heurefin', 'fenetrefin', 'timewindowend', 'end'],
  loadKg: ['poids', 'poidskg', 'kg', 'weight', 'loadkg'],
  volumeL: ['volume', 'volumel', 'litres', 'volumel'],
  serviceMinutes: ['duree', 'dureeservice', 'service', 'serviceminutes', 'minutes'],
  priority: ['priorite', 'priority'],
};

/** Minuscules, sans accents ni separateurs : « Fenêtre début » devient « fenetredebut ». */
function normalizeHeader(header: string): string {
  return header
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const ALIAS_TO_FIELD = new Map<string, keyof ImportStopInput>();
for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
  for (const alias of aliases) {
    ALIAS_TO_FIELD.set(alias, field as keyof ImportStopInput);
  }
}

type RawRow = Record<string, unknown>;

@Injectable()
export class StopsImportService {
  async parse(file: {
    buffer: Buffer;
    originalname: string;
    size: number;
  }): Promise<ParsedImport> {
    if (file.size > MAX_IMPORT_BYTES) {
      throw new BadRequestException(
        `Fichier trop volumineux (${Math.round(file.size / 1024)} Ko, maximum ${MAX_IMPORT_BYTES / 1024} Ko)`,
      );
    }

    const extension = file.originalname.split('.').pop()?.toLowerCase() ?? '';
    const rows =
      extension === 'csv' || extension === 'txt'
        ? parseCsv(file.buffer)
        : await parseXlsx(file.buffer);

    if (rows.length === 0) {
      throw new BadRequestException('Fichier vide ou sans ligne de donnees');
    }
    if (rows.length > MAX_IMPORT_ROWS) {
      throw new BadRequestException(
        `Trop de lignes (${rows.length}, maximum ${MAX_IMPORT_ROWS})`,
      );
    }

    return mapRows(rows);
  }
}

function parseCsv(buffer: Buffer): RawRow[] {
  const result = Papa.parse<RawRow>(buffer.toString('utf8'), {
    header: true,
    skipEmptyLines: 'greedy',
    // Les tableurs francophones exportent souvent en point-virgule ; laisser
    // Papa deviner evite d'imposer un format au dispatcheur.
    delimiter: '',
  });
  return result.data;
}

async function parseXlsx(buffer: Buffer): Promise<RawRow[]> {
  const workbook = new ExcelJS.Workbook();
  try {
    // exceljs embarque sa propre declaration de Buffer, incompatible avec
    // celle de @types/node a la compilation. Au runtime c'est bien un Buffer
    // Node qui est attendu et fourni ; l'ecart est purement nominal.
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new BadRequestException('Fichier illisible : CSV ou XLSX attendu');
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) throw new BadRequestException('Classeur sans feuille');

  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, column) => {
    // `text` et non `value` : une cellule peut porter du texte riche ou une
    // formule, dont la stringification brute donnerait « [object Object] ».
    headers[column] = cell.text.trim();
  });

  const rows: RawRow[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const record: RawRow = {};
    let hasValue = false;
    row.eachCell({ includeEmpty: false }, (cell, column) => {
      const header = headers[column];
      if (!header) return;
      const value = cell.value;
      if (value === null || value === undefined || value === '') return;
      record[header] = typeof value === 'object' ? cell.text : value;
      hasValue = true;
    });
    if (hasValue) rows.push(record);
  });

  return rows;
}

function mapRows(rows: RawRow[]): ParsedImport {
  const stops: CreateStopInput[] = [];
  const errors: ImportRowError[] = [];
  const ignored = new Set<string>();

  rows.forEach((raw, index) => {
    // +2 : la ligne 1 est l'en-tete, et les tableurs comptent a partir de 1.
    const rowNumber = index + 2;
    const candidate: Record<string, unknown> = {};

    for (const [header, value] of Object.entries(raw)) {
      const field = ALIAS_TO_FIELD.get(normalizeHeader(header));
      if (!field) {
        if (header.trim()) ignored.add(header.trim());
        continue;
      }
      const cleaned = typeof value === 'string' ? value.trim() : value;
      // Une cellule vide n'est pas une valeur : laisser le defaut du schema
      // s'appliquer plutot qu'ecrire une chaine vide en base.
      if (cleaned === '' || cleaned === null || cleaned === undefined) continue;
      candidate[field] = cleaned;
    }

    const parsed = importStopSchema.safeParse(candidate);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push({
          row: rowNumber,
          field: issue.path.join('.') || '(ligne)',
          message: issue.message,
        });
      }
      return;
    }

    const windowError = validateTimeWindow(parsed.data);
    if (windowError) {
      errors.push({ row: rowNumber, field: 'timeWindow', message: windowError });
      return;
    }

    stops.push(parsed.data);
  });

  return { stops, errors, ignoredColumns: [...ignored] };
}
