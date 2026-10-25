import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Creations rejouees par la file d'envoi du mobile (decisions.md, 25/10/2026).
 * Exige PostgreSQL demarre et migrations appliquees.
 */

const ORG_A = { phone: '+2250799400001', org: 'Flotte idempotente A' };
const ORG_B = { phone: '+2250799400002', org: 'Flotte idempotente B' };

let app: INestApplication;
let prisma: PrismaService;
let tokenA = '';
let tokenB = '';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function wipe(): Promise<void> {
  await prisma.user.deleteMany({ where: { phone: { in: [ORG_A.phone, ORG_B.phone] } } });
  await prisma.organization.deleteMany({ where: { name: { in: [ORG_A.org, ORG_B.org] } } });
}

async function signUp(account: { phone: string; org: string }): Promise<string> {
  const res = await request(app.getHttpServer()).post('/auth/register').send({
    phone: account.phone,
    password: 'motdepasse-solide',
    fullName: 'Responsable',
    organizationName: account.org,
  });
  expect(res.status).toBe(201);
  return res.body.accessToken;
}

const stopBody = (id: string) => ({
  id,
  label: 'Pharmacie',
  lat: 5.3457,
  lon: -3.9958,
  addressText: 'Cocody Saint Jean',
});

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

describe('Identifiants choisis par le client', () => {
  const missionId = randomUUID();
  const stopId = randomUUID();

  it('cree une mission sous l identifiant fourni', async () => {
    const res = await request(app.getHttpServer())
      .post('/missions')
      .set(auth(tokenA))
      .send({ id: missionId, label: 'Hors connexion', date: '2026-11-05' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(missionId);
  });

  it('renvoie la meme mission sur un rejeu, sans doublon', async () => {
    const res = await request(app.getHttpServer())
      .post('/missions')
      .set(auth(tokenA))
      .send({ id: missionId, label: 'Hors connexion', date: '2026-11-05' });
    expect(res.body.id).toBe(missionId);
    expect(await prisma.mission.count({ where: { label: 'Hors connexion' } })).toBe(1);
  });

  it('absorbe deux rejeux simultanes', async () => {
    const id = randomUUID();
    const send = () =>
      request(app.getHttpServer())
        .post('/missions')
        .set(auth(tokenA))
        .send({ id, date: '2026-11-05' });
    const responses = await Promise.all([send(), send(), send()]);
    expect(responses.map((r) => r.status)).toEqual([201, 201, 201]);
    expect(await prisma.mission.count({ where: { id } })).toBe(1);
  });

  it('refuse l identifiant d une autre organisation sans la reveler', async () => {
    const res = await request(app.getHttpServer())
      .post('/missions')
      .set(auth(tokenB))
      .send({ id: missionId, date: '2026-11-05' });
    expect(res.status).toBe(409);
    expect(JSON.stringify(res.body)).not.toContain('Hors connexion');
  });

  it('refuse un identifiant qui n est pas un UUID', async () => {
    const res = await request(app.getHttpServer())
      .post('/missions')
      .set(auth(tokenA))
      .send({ id: 'mission-1', date: '2026-11-05' });
    expect(res.status).toBe(400);
  });

  it('ajoute un arret de facon idempotente', async () => {
    const send = () =>
      request(app.getHttpServer())
        .post(`/missions/${missionId}/stops`)
        .set(auth(tokenA))
        .send(stopBody(stopId));
    const first = await send();
    const replay = await send();
    expect(first.status).toBe(201);
    expect(replay.body.id).toBe(stopId);
    expect(await prisma.stop.count({ where: { missionId } })).toBe(1);
  });

  it('refuse un identifiant d arret deja pris dans une autre mission', async () => {
    const other = await request(app.getHttpServer())
      .post('/missions')
      .set(auth(tokenA))
      .send({ date: '2026-11-06' });
    const res = await request(app.getHttpServer())
      .post(`/missions/${other.body.id}/stops`)
      .set(auth(tokenA))
      .send(stopBody(stopId));
    expect(res.status).toBe(409);
  });

  it('ne laisse pas changer l identifiant par une modification', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/missions/${missionId}`)
      .set(auth(tokenA))
      .send({ id: randomUUID(), label: 'Renommee' });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(missionId);
  });
});
