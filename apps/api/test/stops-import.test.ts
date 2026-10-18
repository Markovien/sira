import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { beforeAll, describe, expect, it } from 'vitest';
import { StopsImportService } from '../src/missions/stops-import.service';

const service = new StopsImportService();

const asFile = (content: string | Buffer, name: string) => {
  const buffer = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
  return { buffer, originalname: name, size: buffer.length };
};

describe('Import CSV', () => {
  it('reconnait des en-tetes francais accentues et un separateur point-virgule', async () => {
    const csv = [
      'Libellé;Latitude;Longitude;Adresse;Téléphone;Poids (kg)',
      'Pharmacie Saint Jean;5.3457;-3.9958;Carrefour Saint Jean, Cocody;+2250701020304;12',
    ].join('\n');

    const result = await service.parse(asFile(csv, 'courses.csv'));
    expect(result.errors).toEqual([]);
    expect(result.stops).toHaveLength(1);
    expect(result.stops[0]).toMatchObject({
      label: 'Pharmacie Saint Jean',
      lat: 5.3457,
      lon: -3.9958,
      contactPhone: '+2250701020304',
      loadKg: 12,
    });
  });

  it('applique les defauts quand les colonnes optionnelles manquent', async () => {
    const csv = 'nom,lat,lon,adresse\nBoutique,5.33,-4.01,Plateau';
    const result = await service.parse(asFile(csv, 'courses.csv'));
    expect(result.stops[0]).toMatchObject({
      loadKg: 0,
      serviceMinutes: 5,
      priority: 'normal',
    });
  });

  it('importe les lignes valides et rejette les fautives, sans tout annuler', async () => {
    const csv = [
      'nom,lat,lon,adresse',
      'Bonne,5.33,-4.01,Plateau',
      'Mauvaise,pas-un-nombre,-4.01,Plateau',
      // Accra : erreur classique de lat/lon inverses, hors Cote d'Ivoire.
      'Hors zone,5.6,-0.19,Accra',
      'Autre bonne,5.35,-3.99,Cocody',
    ].join('\n');

    const result = await service.parse(asFile(csv, 'courses.csv'));
    expect(result.stops).toHaveLength(2);
    expect(result.stops.map((s) => s.label)).toEqual(['Bonne', 'Autre bonne']);
    // Numerotation telle que vue dans le tableur, en-tete comprise.
    expect(result.errors.map((e) => e.row)).toEqual([3, 4]);
    expect(result.errors[0]?.field).toBe('lat');
  });

  it('signale une fenetre horaire inversee sur la bonne ligne', async () => {
    const csv = ['nom,lat,lon,adresse,debut,fin', 'Arret,5.33,-4.01,Plateau,15:00,09:00'].join(
      '\n',
    );
    const result = await service.parse(asFile(csv, 'courses.csv'));
    expect(result.stops).toHaveLength(0);
    expect(result.errors[0]).toMatchObject({ row: 2, field: 'timeWindow' });
  });

  it('liste les colonnes inconnues plutot que de les ignorer en silence', async () => {
    const csv = 'nom,lat,lon,adresse,Commentaire interne\nBoutique,5.33,-4.01,Plateau,RAS';
    const result = await service.parse(asFile(csv, 'courses.csv'));
    expect(result.ignoredColumns).toEqual(['Commentaire interne']);
    expect(result.stops).toHaveLength(1);
  });

  it('refuse un fichier vide', async () => {
    await expect(service.parse(asFile('nom,lat,lon,adresse', 'vide.csv'))).rejects.toThrow(
      BadRequestException,
    );
  });

  it('refuse un fichier trop volumineux avant meme de l analyser', async () => {
    const gros = { buffer: Buffer.alloc(10), originalname: 'gros.csv', size: 5 * 1024 * 1024 };
    await expect(service.parse(gros)).rejects.toThrow(/trop volumineux/i);
  });
});

describe('Import XLSX', () => {
  let classeur: Buffer;

  beforeAll(async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Courses');
    sheet.addRow(['Nom', 'Latitude', 'Longitude', 'Adresse', 'Priorité']);
    sheet.addRow(['Sococe II Plateaux', 5.3672, -3.9964, 'Centre commercial', 'high']);
    sheet.addRow(['Boulangerie Vallon', 5.3676, -3.9953, 'II Plateaux', 'normal']);
    classeur = Buffer.from(await workbook.xlsx.writeBuffer());
  });

  it('lit un classeur reel ecrit par un tableur', async () => {
    const result = await service.parse(asFile(classeur, 'courses.xlsx'));
    expect(result.errors).toEqual([]);
    expect(result.stops).toHaveLength(2);
    expect(result.stops[0]?.priority).toBe('high');
    expect(result.stops[1]?.label).toBe('Boulangerie Vallon');
  });

  it('refuse un fichier qui n est pas un classeur', async () => {
    await expect(service.parse(asFile('ceci n est pas un xlsx', 'faux.xlsx'))).rejects.toThrow(
      /illisible/i,
    );
  });
});
