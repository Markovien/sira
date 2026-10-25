import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Heure d'une livraison saisie hors connexion (decisions.md, 26/10/2026).
 * Exige PostgreSQL demarre et migrations appliquees.
 */

const ACCOUNT = { phone: '+2250799600001', org: 'Flotte horodatage' };

let app: INestApplication;
let prisma: PrismaService;
let token = '';
let missionId = '';
// La tournee est celle du jour : les heures declarees restent vraisemblables.
const today = new Date().toISOString().slice(0, 10);

const auth = () => ({ Authorization: `Bearer ${token}` });

async function wipe(): Promise<void> {
  await prisma.user.deleteMany({ where: { phone: ACCOUNT.phone } });
  await prisma.organization.deleteMany({ where: { name: ACCOUNT.org } });
}

async function newStop(): Promise<string> {
  const res = await request(app.getHttpServer())
    .post(`/missions/${missionId}/stops`)
    .set(auth())
    .send({
      id: randomUUID(),
      label: 'Client',
      lat: 5.3457,
      lon: -3.9958,
      addressText: 'Cocody',
    });
  expect(res.status).toBe(201);
  return res.body.id;
}

function deliver(stopId: string, body: Record<string, unknown>, deviceTime?: Date) {
  const req = request(app.getHttpServer())
    .patch(`/missions/${missionId}/stops/${stopId}`)
    .set(auth());
  if (deviceTime) req.set('X-Device-Time', deviceTime.toISOString());
  return req.send({ status: 'delivered', ...body });
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
  prisma = app.get(PrismaService);
  await wipe();
  const reg = await request(app.getHttpServer()).post('/auth/register').send({
    phone: ACCOUNT.phone,
    password: 'motdepasse-solide',
    fullName: 'Responsable',
    organizationName: ACCOUNT.org,
  });
  token = reg.body.accessToken;
  const mission = await request(app.getHttpServer())
    .post('/missions')
    .set(auth())
    .send({ date: today });
  missionId = mission.body.id;
});

afterAll(async () => {
  if (prisma) await wipe();
  if (app) await app.close();
});

describe('Heure de livraison', () => {
  it('garde l heure du telephone pour une saisie faite hors connexion', async () => {
    const stopId = await newStop();
    // Apres la creation de l'arret, sinon la borne basse s'applique a juste titre.
    const deliveredAt = new Date();
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    const res = await deliver(stopId, { completedAt: deliveredAt.toISOString() }, new Date());
    expect(res.status).toBe(200);
    expect(
      Math.abs(new Date(res.body.completedAt).getTime() - deliveredAt.getTime()),
    ).toBeLessThan(2_000);
    expect(res.body.timeSuspect).toBe(false);
    expect(res.body.reportedCompletedAt).toBe(deliveredAt.toISOString());
  });

  it('corrige et signale un telephone qui avance de deux heures', async () => {
    const stopId = await newStop();
    const shift = 2 * 3600_000;
    const realDelivery = Date.now();
    const res = await deliver(
      stopId,
      { completedAt: new Date(realDelivery + shift).toISOString() },
      new Date(Date.now() + shift),
    );
    expect(res.body.timeSuspect).toBe(true);
    expect(Math.abs(new Date(res.body.completedAt).getTime() - realDelivery)).toBeLessThan(
      5_000,
    );
  });

  it('ne laisse pas dater une livraison du futur', async () => {
    const stopId = await newStop();
    const res = await deliver(stopId, {
      completedAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    expect(res.body.timeSuspect).toBe(true);
    expect(new Date(res.body.completedAt).getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('signale une horloge reculee constatee par le telephone', async () => {
    const stopId = await newStop();
    const res = await deliver(
      stopId,
      { completedAt: new Date().toISOString(), clockWentBack: true },
      new Date(),
    );
    expect(res.body.timeSuspect).toBe(true);
  });

  it('prend l heure du serveur pour un client en ligne', async () => {
    const stopId = await newStop();
    const res = await deliver(stopId, {});
    expect(res.body.timeSuspect).toBe(false);
    expect(res.body.reportedCompletedAt).toBeNull();
  });

  it('ne reecrit pas l heure d une livraison deja enregistree', async () => {
    const stopId = await newStop();
    const first = await deliver(stopId, { completedAt: new Date().toISOString() }, new Date());
    const replay = await deliver(
      stopId,
      { completedAt: new Date(Date.now() + 3600_000).toISOString() },
      new Date(),
    );
    expect(replay.body.completedAt).toBe(first.body.completedAt);
    expect(replay.body.timeSuspect).toBe(false);
  });
});
