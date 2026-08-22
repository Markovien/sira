import { stopsDatasetSchema, type StopsDataset } from './schemas.js';
import { ABIDJAN_BBOX, isInside } from './geo.js';

export interface DatasetIssue {
  path: string;
  message: string;
}

export interface DatasetValidation {
  ok: boolean;
  issues: DatasetIssue[];
  dataset?: StopsDataset;
}

/**
 * Valide un jeu de donnees d'arrets : schema + coherences metier
 * (identifiants uniques, points dans l'enveloppe d'Abidjan).
 */
export function validateStopsDataset(raw: unknown): DatasetValidation {
  const parsed = stopsDatasetSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    };
  }

  const dataset = parsed.data;
  const issues: DatasetIssue[] = [];
  const seen = new Set<string>();

  for (const entry of [...dataset.depots, ...dataset.stops]) {
    if (seen.has(entry.id)) {
      issues.push({ path: entry.id, message: 'Identifiant duplique' });
    }
    seen.add(entry.id);

    if (!isInside({ lat: entry.lat, lon: entry.lon }, ABIDJAN_BBOX)) {
      issues.push({ path: entry.id, message: 'Point hors de l enveloppe du Grand Abidjan' });
    }
  }

  return issues.length > 0 ? { ok: false, issues } : { ok: true, issues: [], dataset };
}
