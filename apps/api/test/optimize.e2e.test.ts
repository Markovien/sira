import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Orchestration de l'optimisation (roadmap Phase 2.3).
 *
 * Exige OSRM joignable : ces tests verifient justement la chaine complete,
 * les simuler reviendrait a ne rien verifier. Sans OSRM, ils sont ignores
 * explicitement plutot que de faire echouer une suite qui ne peut pas tourner.
 */

const ACCOUNT = { phone: '+2250799500001', org: 'Flotte Optimisation' };
const PASSWORD = 'motdepasse-solide';

/** Points du graphe synthetique de infra/osrm/smoke-synthetic.osm. */
const DEPOT = { lat: 5.3251, lon: -4.0212 };
const POINTS = [
  { label: 'ArretC-loin', lat: 5.3457, lon: -3.9958 },
  { label: 'ArretA-proche', lat: 5.33, lon: -4.015 },
  { label: 'ArretD', lat: 5.33, lon: -3.998 },
  { label: 'ArretB', lat: 5.338, lon: -4.005 },
];

let app: INestApplication;
let prisma: PrismaService;
let token = '';
let organizationId = '';
let depotId = '';
let osrmAvailable = false;
let vrpAvailable = false;

const auth = () => ({ Authorization: `Bearer ${token}` });

async function wipe(): Promise<void> {
  await prisma.user.deleteMany({ where: { phone: ACCOUNT.phone } });
  await prisma.organization.deleteMany({ where: { name: ACCOUNT.org } });
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
  prisma = app.get(PrismaService);
  await wipe();

  const registered = await request(app.getHttpServer()).post('/auth/register').send({
    phone: ACCOUNT.phone,
    password: PASSWORD,
    fullName: 'Dispatcheur',
    organizationName: ACCOUNT.org,
  });
  token = registered.body.accessToken;
  organizationId = registered.body.user.organizationId;

  const depot = await prisma.depot.create({
    data: {
      organizationId,
      label: 'Depot Plateau',
      addressText: 'Plateau',
      lat: DEPOT.lat,
      lon: DEPOT.lon,
    },
  });
  depotId = depot.id;

  // Une matrice OSRM est indispensable : on sonde plutot que de supposer.
  const probe = await request(app.getHttpServer())
    .post('/routing/table')
    .set(auth())
    .send({ points: [DEPOT, POINTS[0]] });
  // 200 exactement, pas 201 : ces routes interrogent, elles ne creent rien.
  // Le defaut POST de NestJS avait fait passer la sonde a cote, et les tests
  // qui en dependent etaient silencieusement ignores.
  osrmAvailable = probe.status === 200;
  if (probe.status === 201) {
    throw new Error('POST /routing/table doit repondre 200, pas 201');
  }

  // Le solveur VRP est un service a part : sa presence se verifie, elle ne se
  // suppose pas.
  vrpAvailable = await fetch(`${process.env.VRP_SOLVER_URL ?? 'http://127.0.0.1:8000'}/health`)
    .then((response) => response.ok)
    .catch(() => false);
});

afterAll(async () => {
  if (prisma) await wipe();
  if (app) await app.close();
});

/**
 * Ignore explicitement plutot que de laisser le test passer a vide : un test
 * saute doit se voir dans le rapport, sinon il ressemble a un test reussi.
 */
function requireOsrm(context: { skip: () => void }): void {
  // Vitest 2 ne prend pas de motif ; le rapport affiche le test comme ignore,
  // et c'est la sonde du beforeAll qui dit pourquoi.
  if (!osrmAvailable) context.skip();
}

async function createMission(withDepot = true): Promise<string> {
  const mission = await request(app.getHttpServer())
    .post('/missions')
    .set(auth())
    .send({
      label: 'Tournee',
      date: '2026-11-05',
      ...(withDepot ? { startDepotId: depotId } : {}),
    });

  // Saisis volontairement dans un ordre inefficace : le solveur doit le defaire.
  for (const point of POINTS) {
    await request(app.getHttpServer())
      .post(`/missions/${mission.body.id}/stops`)
      .set(auth())
      .send({
        label: point.label,
        lat: point.lat,
        lon: point.lon,
        addressText: 'Abidjan',
        loadKg: 10,
        serviceMinutes: 5,
      })
      .expect(201);
  }

  return mission.body.id;
}

describe('POST /missions/:id/optimize', () => {
  it('refuse une mission de moins de deux arrets', async () => {
    const mission = await request(app.getHttpServer())
      .post('/missions')
      .set(auth())
      .send({ date: '2026-11-05', startDepotId: depotId });

    const res = await request(app.getHttpServer())
      .post(`/missions/${mission.body.id}/optimize`)
      .set(auth())
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/deux arrets/);
  });

  it('refuse d optimiser la mission d une autre organisation', async () => {
    const missionId = await createMission();
    const autre = await request(app.getHttpServer()).post('/auth/register').send({
      phone: '+2250799500002',
      password: PASSWORD,
      fullName: 'Tiers',
      organizationName: 'Organisation tierce',
    });

    try {
      const res = await request(app.getHttpServer())
        .post(`/missions/${missionId}/optimize`)
        .set({ Authorization: `Bearer ${autre.body.accessToken}` })
        .send({});
      expect(res.status).toBe(404);
    } finally {
      await prisma.user.deleteMany({ where: { phone: '+2250799500002' } });
      await prisma.organization.deleteMany({ where: { name: 'Organisation tierce' } });
    }
  });

  it('ordonne les arrets et persiste les ETA (TSP, un vehicule)', async (context) => {
    requireOsrm(context);
    const missionId = await createMission();

    const res = await request(app.getHttpServer())
      .post(`/missions/${missionId}/optimize`)
      .set(auth())
      .send({ departureTime: '07:00' });

    expect(res.status).toBe(200);
    expect(res.body.solver).toBe('tsp');
    expect(res.body.unservedStopIds).toEqual([]);
    expect(res.body.missions[0].stopCount).toBe(4);

    const mission = await request(app.getHttpServer())
      .get(`/missions/${missionId}`)
      .set(auth());

    expect(mission.body.status).toBe('planned');
    expect(mission.body.optimizedAt).toBeTruthy();
    expect(mission.body.estimatedDurationSeconds).toBeGreaterThan(0);

    const stops = mission.body.stops as {
      label: string;
      sequence: number;
      estimatedArrival: string;
    }[];

    // Les arrets reviennent tries par sequence : elle doit etre 0,1,2,3.
    expect(stops.map((s) => s.sequence)).toEqual([0, 1, 2, 3]);

    // Le plus proche du depot doit passer avant le plus lointain : c'est le
    // signe que l'ordre de saisie a bien ete defait.
    const positions = new Map(stops.map((s) => [s.label, s.sequence]));
    expect(positions.get('ArretA-proche')!).toBeLessThan(positions.get('ArretC-loin')!);

    // Les ETA sont croissantes et partent apres l'heure de depart.
    const arrivals = stops.map((s) => new Date(s.estimatedArrival).getTime());
    expect(arrivals).toEqual([...arrivals].sort((a, b) => a - b));
    const departure = new Date('2026-11-05T07:00:00.000Z').getTime();
    expect(arrivals[0]!).toBeGreaterThan(departure);
  });

  it('exige un depot pour optimiser une flotte de plusieurs vehicules', async (context) => {
    requireOsrm(context);
    const missionId = await createMission(false);
    const vehicles = await prisma.vehicle.createManyAndReturn({
      data: [
        { organizationId, label: 'Moto 1', capacityKg: 100 },
        { organizationId, label: 'Moto 2', capacityKg: 100 },
      ],
    });

    const res = await request(app.getHttpServer())
      .post(`/missions/${missionId}/optimize`)
      .set(auth())
      .send({ vehicleIds: vehicles.map((v) => v.id) });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/depot de depart/);
  });

  it('scinde la mission en une tournee par vehicule (VRP, flotte)', async (context) => {
    requireOsrm(context);
    if (!vrpAvailable) context.skip();
    const missionId = await createMission();
    const vehicles = await prisma.vehicle.createManyAndReturn({
      data: [
        { organizationId, label: 'Moto A', capacityKg: 20 },
        { organizationId, label: 'Moto B', capacityKg: 20 },
      ],
    });

    const res = await request(app.getHttpServer())
      .post(`/missions/${missionId}/optimize`)
      .set(auth())
      .send({ vehicleIds: vehicles.map((v) => v.id), timeLimitMs: 3000 });

    expect(res.status).toBe(200);
    expect(res.body.solver).toBe('vrp');
    expect(res.body.unservedStopIds).toEqual([]);

    // Capacite de 20 kg pour 4 arrets de 10 kg : deux tournees au moins sont
    // necessaires, ce qui force le fractionnement.
    expect(res.body.missions.length).toBeGreaterThan(1);

    // La mission d'origine reste la premiere ; les autres sont creees a cote.
    expect(res.body.missions[0].missionId).toBe(missionId);

    const missionIds = res.body.missions.map((m: { missionId: string }) => m.missionId);
    const stops = await prisma.stop.findMany({
      where: { missionId: { in: missionIds } },
      select: { id: true, missionId: true, sequence: true, estimatedArrival: true },
    });

    // Les quatre arrets sont repartis, aucun perdu, aucun duplique.
    expect(stops).toHaveLength(4);
    expect(stops.every((stop) => stop.sequence !== null)).toBe(true);
    expect(stops.every((stop) => stop.estimatedArrival !== null)).toBe(true);

    // Chaque tournee est numerotee a partir de zero, independamment des autres.
    for (const id of missionIds) {
      const sequences = stops
        .filter((stop) => stop.missionId === id)
        .map((stop) => stop.sequence!)
        .sort((a, b) => a - b);
      expect(sequences).toEqual(sequences.map((_, index) => index));
    }

    // Chaque mission creee porte son vehicule : c'est ce que le mobile lira.
    const created = await prisma.mission.findMany({ where: { id: { in: missionIds } } });
    expect(created.every((mission) => mission.vehicleId !== null)).toBe(true);
    expect(created.every((mission) => mission.optimizedAt !== null)).toBe(true);
    expect(new Set(created.map((mission) => mission.vehicleId)).size).toBe(created.length);
  });

  it('refuse un vehicule d une autre organisation', async (context) => {
    requireOsrm(context);
    const missionId = await createMission();
    const autreOrg = await prisma.organization.create({ data: { name: 'Org vehicule' } });
    const vehicule = await prisma.vehicle.create({
      data: { organizationId: autreOrg.id, label: 'Moto etrangere' },
    });

    try {
      const res = await request(app.getHttpServer())
        .post(`/missions/${missionId}/optimize`)
        .set(auth())
        .send({ vehicleIds: [vehicule.id] });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/introuvable dans cette organisation/);
    } finally {
      await prisma.organization.delete({ where: { id: autreOrg.id } });
    }
  });
});
