import { describe, expect, it } from 'vitest';
import { createLocalDb } from '../src/core/local-db';
import { createSyncEngine, LAST_SYNC_KEY } from '../src/core/sync';
import { apiOn, fakeBackend } from './support/fake-api';
import { mission, stop } from './support/fixtures';
import { memorySqlite } from './support/sqlite';

const NOW = new Date('2026-10-25T12:00:00Z');
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function setup() {
  const backend = fakeBackend();
  const db = createLocalDb(memorySqlite());
  await db.migrate();
  const engine = createSyncEngine({ db, api: apiOn(backend), now: () => NOW });
  return { backend, db, engine };
}

const newStop = (n: number) => ({
  id: uuid(n),
  label: `Arret ${n}`,
  lat: 5.3 + n / 1000,
  lon: -4.0,
  addressText: 'Abidjan',
  loadKg: 0,
  volumeL: 0,
  serviceMinutes: 5,
  priority: 'normal' as const,
});

describe('synchronisation', () => {
  it('cree 15 arrets en mode avion et les envoie tous a la reconnexion', async () => {
    const { backend, db, engine } = await setup();
    backend.state.online = false;

    await db.createMission({ id: uuid(0), label: 'Tournee', date: '2026-11-04' }, NOW);
    for (let n = 1; n <= 15; n += 1) await db.addStop(uuid(0), newStop(n), NOW);

    expect(await engine.sync()).toMatchObject({ status: 'offline', pushed: 0 });
    expect((await db.syncCounts()).pending).toBe(16);
    expect(backend.missions.size).toBe(0);

    backend.state.online = true;
    expect(await engine.sync()).toMatchObject({ status: 'synced', pushed: 16, rejected: 0 });
    expect(backend.missions.size).toBe(1);
    expect(backend.stops.size).toBe(15);
    expect(await db.syncCounts()).toEqual({ pending: 0, rejected: 0 });
    expect(await db.getMeta(LAST_SYNC_KEY)).toBe(NOW.toISOString());
    // Relue depuis le serveur, la mission locale garde ses 15 arrets.
    expect((await db.getMission(uuid(0)))?.stops).toHaveLength(15);
  });

  it('ne cree pas de doublon quand la reponse se perd', async () => {
    const { backend, db, engine } = await setup();
    await db.createMission({ id: uuid(0), date: '2026-11-04' }, NOW);
    backend.state.dropNextResponse = true;

    expect((await engine.sync()).status).toBe('offline');
    expect(backend.missions.size).toBe(1); // le serveur l'a bien enregistree
    expect((await db.syncCounts()).pending).toBe(1); // le telephone ne le sait pas

    expect((await engine.sync()).status).toBe('synced');
    expect(backend.missions.size).toBe(1);
    expect((await db.syncCounts()).pending).toBe(0);
  });

  it('garde la file intacte et dans l ordre sur une panne serveur', async () => {
    const { backend, db, engine } = await setup();
    await db.createMission({ id: uuid(0), date: '2026-11-04' }, NOW);
    await db.addStop(uuid(0), newStop(1), NOW);
    backend.state.failNextWrite = 503;

    expect((await engine.sync()).status).toBe('offline');
    expect((await db.nextOutboxEntry())?.mutation.kind).toBe('createMission');
    expect((await db.nextOutboxEntry())?.attempts).toBe(1);

    expect(await engine.sync()).toMatchObject({ status: 'synced', pushed: 2 });
  });

  it('ecarte un refus definitif sans bloquer la suite', async () => {
    const { backend, db, engine } = await setup();
    await db.createMission({ id: uuid(0), date: '2026-11-04' }, NOW);
    await db.createMission({ id: uuid(1), date: '2026-11-05' }, NOW);
    backend.state.failNextWrite = 403;

    expect(await engine.sync()).toMatchObject({ status: 'synced', pushed: 1, rejected: 1 });
    expect(await db.syncCounts()).toEqual({ pending: 0, rejected: 1 });
    expect([...backend.missions.keys()]).toEqual([uuid(1)]);
  });

  it('relit les missions du serveur et purge celles qui ont disparu', async () => {
    const { backend, db, engine } = await setup();
    backend.missions.set('srv-1', mission('srv-1'));
    backend.stops.set('a', stop('a', 'srv-1'));
    backend.missions.set('srv-2', mission('srv-2'));
    await engine.sync();
    expect((await db.listMissions()).map((m) => m.id).sort()).toEqual(['srv-1', 'srv-2']);

    backend.missions.delete('srv-2');
    await engine.sync();
    expect((await db.listMissions()).map((m) => m.id)).toEqual(['srv-1']);
  });

  it('ne relit pas en detail une mission terminee deja connue', async () => {
    const { backend, engine } = await setup();
    backend.missions.set('done', mission('done', { status: 'completed' }));
    await engine.sync();
    backend.state.requests.length = 0;
    await engine.sync();
    expect(backend.state.requests).not.toContain('GET /missions/done');
  });

  it('ne lance qu un passage a la fois', async () => {
    const { backend, engine } = await setup();
    backend.missions.set('srv-1', mission('srv-1'));
    const [a, b] = await Promise.all([engine.sync(), engine.sync()]);
    expect(a).toBe(b);
    expect(backend.state.requests.filter((r) => r === 'GET /missions')).toHaveLength(1);
  });
});
