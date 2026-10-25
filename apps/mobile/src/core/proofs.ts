import type { LocalDb } from './local-db';

/** Fichiers photo des preuves, sur le telephone. Injecte : `expo-file-system` en production. */
export interface ProofFiles {
  list(): Promise<string[]>;
  remove(name: string): Promise<void>;
}

/**
 * Purge des preuves (decisions.md, 26/10/2026) : les lignes de plus de 30
 * jours d'abord, puis tout fichier qu'aucune ligne ne reference plus — y
 * compris ceux laisses par une base videe a la deconnexion. Lancee a
 * l'ouverture de l'app : aucune tache de fond.
 */
export async function purgeProofs(db: LocalDb, files: ProofFiles, now: Date): Promise<number> {
  const kept = await db.expireProofs(now);
  let removed = 0;
  for (const name of await files.list()) {
    if (kept.has(name)) continue;
    await files.remove(name);
    removed += 1;
  }
  return removed;
}
