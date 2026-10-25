import { describe, expect, it } from 'vitest';
import { createLocalDb } from '../src/core/local-db';
import { detail, mission, stop } from './support/fixtures';
import { memorySqlite } from './support/sqlite';

const NOW = new Date('2026-10-25T12:00:00Z');
const M1 = '0f8e1d2c-3b4a-4596-8877-665544332211';
const S1 = '1a2b3c4d-5e6f-4a1b-9c2d-3e4f5a6b7c8d';
const S2 = '2b3c4d5e-6f7a-4b2c-8d3e-4f5a6b7c8d9e';

async function freshDb() {
  const db = createLocalDb(memorySqlite());
  await db.migrate();
  return db;
}

const newStop = (id: string, label: string) => ({
  id,
  label,
  lat: 5.3457,
  lon: -3.9958,
  addressText: 'Cocody Saint Jean',
  informalDescription: 'Portail bleu, face au maquis',
  loadKg: 0,
  volumeL: 0,
  serviceMinutes: 5,
  priority: 'normal' as const,
});

describe('base locale', () => {
  it('migre deux fois sans erreur', async () => {
    const db = await freshDb();
    await expect(db.migrate()).resolves.toBeUndefined();
  });

  it('montre tout de suite une mission saisie hors connexion, et la met en file', async () => {
    const db = await freshDb();
    await db.createMission({ id: M1, label: 'Ma tournee', date: '2026-11-04' }, NOW);
    await db.addStop(M1, newStop(S1, 'Pharmacie'), NOW);
    await db.addStop(M1, newStop(S2, 'Boutique'), NOW);

    const [summary] = await db.listMissions();
    expect(summary).toMatchObject({ id: M1, status: 'draft', stopCount: 2, pendingChanges: 3 });
    expect(summary?.date).toBe('2026-11-04T00:00:00.000Z');

    const local = await db.getMission(M1);
    expect(local?.stops.map((s) => s.label)).toEqual(['Pharmacie', 'Boutique']);

    const first = await db.nextOutboxEntry();
    expect(first?.mutation.kind).toBe('createMission');
    expect(first?.createdAt).toBe(NOW.toISOString());
  });

  it('refuse un arret sur une mission inconnue, sans rien mettre en file', async () => {
    const db = await freshDb();
    await expect(db.addStop(M1, newStop(S1, 'Pharmacie'), NOW)).rejects.toThrow(/absente/);
    expect(await db.syncCounts()).toEqual({ pending: 0, rejected: 0 });
  });

  it('refuse un identifiant qui n est pas un UUID', async () => {
    const db = await freshDb();
    await expect(db.createMission({ id: 'm1', date: '2026-11-04' }, NOW)).rejects.toThrow();
  });

  it('sort un refus definitif de la file sans perdre la trace', async () => {
    const db = await freshDb();
    await db.createMission({ id: M1, date: '2026-11-04' }, NOW);
    const entry = await db.nextOutboxEntry();
    await db.rejectOutboxEntry(entry!.seq, '403 Acces refuse');
    expect(await db.syncCounts()).toEqual({ pending: 0, rejected: 1 });
    expect(await db.nextOutboxEntry()).toBeNull();
  });

  it('applique l etat serveur sans ecraser une saisie en attente', async () => {
    const db = await freshDb();
    await db.applyServerState(
      [mission('srv-1'), mission('srv-2', { status: 'completed' })],
      [detail(mission('srv-1'), [stop('a', 'srv-1'), stop('b', 'srv-1')])],
    );
    await db.createMission({ id: M1, date: '2026-11-04' }, NOW);

    // Second passage : srv-2 a disparu cote serveur, M1 n'y est pas encore.
    await db.applyServerState(
      [mission('srv-1', { status: 'in_progress' })],
      [detail(mission('srv-1', { status: 'in_progress' }), [stop('b', 'srv-1')])],
    );
    const ids = (await db.listMissions()).map((m) => m.id).sort();
    expect(ids).toEqual([M1, 'srv-1'].sort());
    const srv1 = await db.getMission('srv-1');
    expect(srv1?.status).toBe('in_progress');
    expect(srv1?.stops.map((s) => s.id)).toEqual(['b']);
  });

  it('met a jour le statut d une mission non relue en detail', async () => {
    const db = await freshDb();
    await db.applyServerState(
      [mission('srv-1')],
      [detail(mission('srv-1'), [stop('a', 'srv-1')])],
    );
    await db.applyServerState([mission('srv-1', { status: 'completed' })], []);
    const srv1 = await db.getMission('srv-1');
    expect(srv1?.status).toBe('completed');
    expect(srv1?.stops).toHaveLength(1);
  });

  it('retrouve un lieu deja servi par son libelle, son adresse ou son repere', async () => {
    const db = await freshDb();
    await db.applyServerState(
      [mission('srv-1'), mission('srv-2')],
      [
        detail(mission('srv-1'), [
          stop('a', 'srv-1', {
            label: 'Pharmacie Saint Jean',
            informalDescription: 'portail bleu',
          }),
        ]),
        detail(mission('srv-2'), [
          stop('b', 'srv-2', {
            label: 'Pharmacie Saint Jean',
            informalDescription: 'portail bleu',
          }),
          stop('c', 'srv-2', { label: 'Maquis 100% chic', addressText: 'Yopougon' }),
        ]),
      ],
    );
    expect((await db.searchKnownPlaces('pharma')).map((p) => p.label)).toEqual([
      'Pharmacie Saint Jean',
    ]);
    expect(await db.searchKnownPlaces('BLEU')).toHaveLength(1);
    expect((await db.searchKnownPlaces('yopougon'))[0]?.label).toBe('Maquis 100% chic');
    // `%` est un caractere comme un autre, pas un joker.
    expect(await db.searchKnownPlaces('100%')).toHaveLength(1);
    expect(await db.searchKnownPlaces('%')).toHaveLength(1);
  });

  it('serialise les ecritures concurrentes', async () => {
    const db = await freshDb();
    await db.createMission({ id: M1, date: '2026-11-04' }, NOW);
    const ids = Array.from(
      { length: 15 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    );
    await Promise.all(ids.map((id, i) => db.addStop(M1, newStop(id, `Arret ${i}`), NOW)));
    const local = await db.getMission(M1);
    expect(local?.stops).toHaveLength(15);
    expect(new Set(local?.stops.map((s) => s.label)).size).toBe(15);
  });
});

describe('appartenance', () => {
  it('vide la base quand un autre utilisateur se connecte', async () => {
    const db = await freshDb();
    expect(await db.claimFor('livreur-1')).toBe(false);
    await db.createMission({ id: M1, date: '2026-11-04' }, NOW);
    expect(await db.claimFor('livreur-1')).toBe(false);
    expect(await db.listMissions()).toHaveLength(1);

    expect(await db.claimFor('livreur-2')).toBe(true);
    expect(await db.listMissions()).toHaveLength(0);
    expect(await db.syncCounts()).toEqual({ pending: 0, rejected: 0 });
  });

  it('ne garde rien apres une deconnexion volontaire', async () => {
    const db = await freshDb();
    await db.claimFor('livreur-1');
    await db.createMission({ id: M1, date: '2026-11-04' }, NOW);
    await db.reset();
    expect(await db.listMissions()).toHaveLength(0);
    // Plus de proprietaire : le suivant, quel qu'il soit, part d'une base vide.
    expect(await db.getMeta('owner')).toBeNull();
  });
});
