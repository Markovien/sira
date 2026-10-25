import { describe, expect, it } from 'vitest';
import { createLocalDb } from '../src/core/local-db';
import { purgeProofs, type ProofFiles } from '../src/core/proofs';
import { memorySqlite } from './support/sqlite';

function fakeFiles(names: string[]): ProofFiles & { names: Set<string> } {
  const set = new Set(names);
  return {
    names: set,
    list: () => Promise.resolve([...set]),
    remove: (name) => {
      set.delete(name);
      return Promise.resolve();
    },
  };
}

describe('purgeProofs', () => {
  it('supprime les fichiers expires et orphelins, garde les recents', async () => {
    const db = createLocalDb(memorySqlite());
    await db.migrate();
    const now = new Date('2026-12-05T00:00:00Z');
    await db.addProof({
      id: 'p1',
      stopId: 's1',
      kind: 'photo',
      data: 'vieille.jpg',
      createdAt: '2026-11-01T00:00:00.000Z',
    });
    await db.addProof({
      id: 'p2',
      stopId: 's1',
      kind: 'photo',
      data: 'recente.jpg',
      createdAt: '2026-12-01T00:00:00.000Z',
    });
    // `orpheline.jpg` : laissee par une base videe a la deconnexion.
    const files = fakeFiles(['vieille.jpg', 'recente.jpg', 'orpheline.jpg']);

    expect(await purgeProofs(db, files, now)).toBe(2);
    expect([...files.names]).toEqual(['recente.jpg']);
  });

  it('vide tout apres une deconnexion', async () => {
    const db = createLocalDb(memorySqlite());
    await db.migrate();
    await db.addProof({
      id: 'p1',
      stopId: 's1',
      kind: 'photo',
      data: 'a.jpg',
      createdAt: new Date().toISOString(),
    });
    await db.reset();
    const files = fakeFiles(['a.jpg']);
    await purgeProofs(db, files, new Date());
    expect(files.names.size).toBe(0);
  });
});
