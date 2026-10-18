import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * CRUD des missions, et surtout cloisonnement entre organisations.
 * Exige PostgreSQL demarre et migrations appliquees.
 */

const ORG_A = { phone: '+2250799100001', org: 'Flotte A' };
const ORG_B = { phone: '+2250799100002', org: 'Flotte B' };
const PASSWORD = 'motdepasse-solide';

let app: INestApplication;
let prisma: PrismaService;
let tokenA = '';
let tokenB = '';

async function wipe(): Promise<void> {
  const phones = [ORG_A.phone, ORG_B.phone];
  await prisma.user.deleteMany({ where: { phone: { in: phones } } });
  await prisma.organization.deleteMany({ where: { name: { in: [ORG_A.org, ORG_B.org] } } });
}

async function signUp(account: { phone: string; org: string }): Promise<string> {
  const res = await request(app.getHttpServer()).post('/auth/register').send({
    phone: account.phone,
    password: PASSWORD,
    fullName: 'Responsable',
    organizationName: account.org,
  });
  expect(res.status).toBe(201);
  return res.body.accessToken;
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
  prisma = app.get(PrismaService);
  await wipe();
  tokenA = await signUp(ORG_A);
  tokenB = await signUp(ORG_B);
});

afterAll(async () => {
  if (prisma) await wipe();
  if (app) await app.close();
});

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('Missions', () => {
  let missionId = '';
  let stopId = '';

  it('refuse toute route sans jeton', async () => {
    expect((await request(app.getHttpServer()).get('/missions')).status).toBe(401);
  });

  it('cree une mission', async () => {
    const res = await request(app.getHttpServer())
      .post('/missions')
      .set(auth(tokenA))
      .send({ label: 'Tournee du matin', date: '2026-11-03' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('draft');
    missionId = res.body.id;
  });

  it('refuse une date mal formee', async () => {
    const res = await request(app.getHttpServer())
      .post('/missions')
      .set(auth(tokenA))
      .send({ date: '03/11/2026' });
    expect(res.status).toBe(400);
    expect(res.body.errors[0].path).toBe('date');
  });

  it('refuse un vehicule d une autre organisation', async () => {
    // `name` n'est pas unique sur Organization : on passe par l'utilisateur,
    // dont le telephone l'est.
    const responsableB = await prisma.user.findUniqueOrThrow({
      where: { phone: ORG_B.phone },
    });
    const vehicule = await prisma.vehicle.create({
      data: { label: 'Moto de B', organizationId: responsableB.organizationId },
    });
    const res = await request(app.getHttpServer())
      .post('/missions')
      .set(auth(tokenA))
      .send({ date: '2026-11-03', vehicleId: vehicule.id });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Vehicule introuvable/);
  });

  it('ajoute un arret avec son adressage informel', async () => {
    const res = await request(app.getHttpServer())
      .post(`/missions/${missionId}/stops`)
      .set(auth(tokenA))
      .send({
        label: 'Pharmacie Saint Jean',
        lat: 5.3457,
        lon: -3.9958,
        addressText: 'Carrefour Saint Jean, Cocody',
        informalDescription: 'En face de la station, portail bleu a cote du maquis',
        loadKg: 12,
      });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending');
    expect(res.body.loadKg).toBe(12);
    stopId = res.body.id;
  });

  it('refuse une coordonnee hors de Cote d Ivoire', async () => {
    const res = await request(app.getHttpServer())
      .post(`/missions/${missionId}/stops`)
      .set(auth(tokenA))
      // Accra : l'erreur typique d'un import avec lat/lon inverses.
      .send({ label: 'Accra', lat: 5.6, lon: -0.19, addressText: 'Ghana' });
    expect(res.status).toBe(400);
  });

  it('refuse une fenetre horaire incomplete puis inversee', async () => {
    const incomplete = await request(app.getHttpServer())
      .post(`/missions/${missionId}/stops`)
      .set(auth(tokenA))
      .send({
        label: 'Arret',
        lat: 5.33,
        lon: -4.01,
        addressText: 'Plateau',
        timeWindowStart: '08:00',
      });
    expect(incomplete.status).toBe(400);
    expect(incomplete.body.message).toMatch(/incomplete/);

    const inversee = await request(app.getHttpServer())
      .post(`/missions/${missionId}/stops`)
      .set(auth(tokenA))
      .send({
        label: 'Arret',
        lat: 5.33,
        lon: -4.01,
        addressText: 'Plateau',
        timeWindowStart: '15:00',
        timeWindowEnd: '09:00',
      });
    expect(inversee.status).toBe(400);
  });

  it('valide la fenetre sur l etat resultant, pas sur le seul correctif', async () => {
    // L'arret a deja 08:00-11:00 ; envoyer une fin a 07:00 doit echouer meme si
    // le correctif seul ne contient pas de debut.
    await request(app.getHttpServer())
      .patch(`/missions/${missionId}/stops/${stopId}`)
      .set(auth(tokenA))
      .send({ timeWindowStart: '08:00', timeWindowEnd: '11:00' })
      .expect(200);

    const res = await request(app.getHttpServer())
      .patch(`/missions/${missionId}/stops/${stopId}`)
      .set(auth(tokenA))
      .send({ timeWindowEnd: '07:00' });
    expect(res.status).toBe(400);
  });

  it('marque un arret livre et horodate la completion', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/missions/${missionId}/stops/${stopId}`)
      .set(auth(tokenA))
      .send({ status: 'delivered' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('delivered');
    expect(res.body.completedAt).toBeTruthy();
  });

  it('refuse un PATCH vide plutot que de ne rien faire', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/missions/${missionId}`)
      .set(auth(tokenA))
      .send({});
    expect(res.status).toBe(400);
  });

  it('liste les missions de son organisation uniquement', async () => {
    const a = await request(app.getHttpServer()).get('/missions').set(auth(tokenA));
    const b = await request(app.getHttpServer()).get('/missions').set(auth(tokenB));
    expect(a.status).toBe(200);
    expect(a.body.missions.length).toBeGreaterThan(0);
    expect(b.body.missions).toHaveLength(0);
  });

  it('renvoie 404 et non 403 sur la mission d une autre organisation', async () => {
    // 403 confirmerait l'existence de la mission ; 404 ne revele rien.
    const lecture = await request(app.getHttpServer())
      .get(`/missions/${missionId}`)
      .set(auth(tokenB));
    expect(lecture.status).toBe(404);

    const ecriture = await request(app.getHttpServer())
      .patch(`/missions/${missionId}`)
      .set(auth(tokenB))
      .send({ label: 'Detournee' });
    expect(ecriture.status).toBe(404);

    const suppression = await request(app.getHttpServer())
      .delete(`/missions/${missionId}`)
      .set(auth(tokenB));
    expect(suppression.status).toBe(404);
  });

  it('empeche d atteindre un arret par la mission d une autre organisation', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/missions/${missionId}/stops/${stopId}`)
      .set(auth(tokenB))
      .send({ status: 'failed' });
    expect(res.status).toBe(404);
  });

  it('supprime la mission et ses arrets en cascade', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/missions/${missionId}`)
      .set(auth(tokenA));
    expect(res.status).toBe(204);

    expect(await prisma.stop.count({ where: { id: stopId } })).toBe(0);
    expect(
      (await request(app.getHttpServer()).get(`/missions/${missionId}`).set(auth(tokenA)))
        .status,
    ).toBe(404);
  });
});
