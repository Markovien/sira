import type { INestApplication } from '@nestjs/common';
import {
  authResponseSchema,
  geocodeSearchResponseSchema,
  missionDetailSchema,
  missionListSchema,
  tableResponseSchema,
} from '@sira/shared';
import { Test } from '@nestjs/testing';
import { hash } from 'bcrypt';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Le parcours de l'app livreur : connexion, liste, detail. Un livreur ne voit et ne modifie que ses propres missions
 * (decisions.md, 25/10/2026). Exige PostgreSQL demarre et migrations appliquees.
 */

const ADMIN = { phone: '+2250799200001', org: 'Flotte des livreurs' };
const DRIVER_1 = '+2250799200002';
const DRIVER_2 = '+2250799200003';
const PASSWORD = 'motdepasse-solide';

let app: INestApplication;
let prisma: PrismaService;
let adminToken = '';
let driver1Token = '';
let missionOf1 = '';
let missionOf2 = '';
let stopOf2 = '';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function wipe(): Promise<void> {
  await prisma.user.deleteMany({ where: { phone: { in: [ADMIN.phone, DRIVER_1, DRIVER_2] } } });
  await prisma.organization.deleteMany({ where: { name: ADMIN.org } });
}

async function login(phone: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ phone, password: PASSWORD });
  expect(res.status).toBe(200);
  return res.body.accessToken;
}

async function missionFor(driverId: string, label: string): Promise<string> {
  const created = await request(app.getHttpServer())
    .post('/missions')
    .set(auth(adminToken))
    .send({ label, date: '2026-11-04', driverId });
  expect(created.status).toBe(201);
  return created.body.id;
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
  prisma = app.get(PrismaService);
  await wipe();

  const registered = await request(app.getHttpServer()).post('/auth/register').send({
    phone: ADMIN.phone,
    password: PASSWORD,
    fullName: 'Responsable',
    organizationName: ADMIN.org,
  });
  expect(registered.status).toBe(201);
  adminToken = registered.body.accessToken;
  const organizationId: string = registered.body.user.organizationId;

  // Aucune route ne cree encore de livreur (Phase 4) : directement en base.
  const passwordHash = await hash(PASSWORD, 4);
  const [driver1, driver2] = await Promise.all(
    [DRIVER_1, DRIVER_2].map((phone) =>
      prisma.user.create({
        data: { organizationId, phone, passwordHash, fullName: 'Livreur', role: 'driver' },
      }),
    ),
  );
  driver1Token = await login(DRIVER_1);

  missionOf1 = await missionFor(driver1!.id, 'Tournee du livreur 1');
  missionOf2 = await missionFor(driver2!.id, 'Tournee du livreur 2');
  const stop = await request(app.getHttpServer())
    .post(`/missions/${missionOf2}/stops`)
    .set(auth(adminToken))
    .send({ label: 'Client', lat: 5.3457, lon: -3.9958, addressText: 'Cocody Saint Jean' });
  expect(stop.status).toBe(201);
  stopOf2 = stop.body.id;
});

afterAll(async () => {
  if (prisma) await wipe();
  if (app) await app.close();
});

describe('Cloisonnement par livreur', () => {
  it('ne liste au livreur que ses missions', async () => {
    const res = await request(app.getHttpServer()).get('/missions').set(auth(driver1Token));
    expect(res.status).toBe(200);
    expect(res.body.missions.map((m: { id: string }) => m.id)).toEqual([missionOf1]);
  });

  it('ignore un filtre driverId pointant un collegue', async () => {
    const driver2 = await prisma.user.findUniqueOrThrow({ where: { phone: DRIVER_2 } });
    const res = await request(app.getHttpServer())
      .get(`/missions?driverId=${driver2.id}`)
      .set(auth(driver1Token));
    expect(res.body.missions.map((m: { id: string }) => m.id)).toEqual([missionOf1]);
  });

  it('repond 404 sur la mission d un collegue', async () => {
    const own = await request(app.getHttpServer())
      .get(`/missions/${missionOf1}`)
      .set(auth(driver1Token));
    expect(own.status).toBe(200);
    const other = await request(app.getHttpServer())
      .get(`/missions/${missionOf2}`)
      .set(auth(driver1Token));
    expect(other.status).toBe(404);
  });

  it('refuse de modifier un arret d un collegue', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/missions/${missionOf2}/stops/${stopOf2}`)
      .set(auth(driver1Token))
      .send({ status: 'delivered' });
    expect(res.status).toBe(404);
    const stop = await prisma.stop.findUniqueOrThrow({ where: { id: stopOf2 } });
    expect(stop.status).toBe('pending');
  });

  it('laisse a l administrateur la vue complete', async () => {
    const res = await request(app.getHttpServer()).get('/missions').set(auth(adminToken));
    const ids = res.body.missions.map((m: { id: string }) => m.id);
    expect(ids).toEqual(expect.arrayContaining([missionOf1, missionOf2]));
  });
});

// Le mobile valide chaque reponse avec ces schemas : un ecart ici serait une
// app qui refuse ses propres donnees.
describe('Contrat des reponses avec @sira/shared', () => {
  it('connexion', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ phone: DRIVER_1, password: PASSWORD });
    expect(authResponseSchema.safeParse(res.body).error).toBeUndefined();
  });

  it('liste et detail', async () => {
    const list = await request(app.getHttpServer()).get('/missions').set(auth(adminToken));
    expect(missionListSchema.safeParse(list.body).error).toBeUndefined();
    const detail = await request(app.getHttpServer())
      .get(`/missions/${missionOf2}`)
      .set(auth(adminToken));
    const parsed = missionDetailSchema.safeParse(detail.body);
    expect(parsed.error).toBeUndefined();
    expect(parsed.data?.stops).toHaveLength(1);
  });

  it('matrice de routage', async () => {
    // Points de l'extrait OSRM synthetique, demarre pour les e2e.
    const res = await request(app.getHttpServer())
      .post('/routing/table')
      .set(auth(driver1Token))
      .send({
        points: [
          { lat: 5.3251, lon: -4.0212 },
          { lat: 5.3457, lon: -3.9958 },
        ],
        withDistances: true,
      });
    expect(res.status).toBe(200);
    expect(tableResponseSchema.safeParse(res.body).error).toBeUndefined();
  });

  it('recherche d adresse', async () => {
    const res = await request(app.getHttpServer())
      .get('/geocoding/search')
      .query({ q: 'pharmacie' })
      .set(auth(driver1Token));
    expect(geocodeSearchResponseSchema.safeParse(res.body).error).toBeUndefined();
  });
});
