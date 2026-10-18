import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Parcours d'authentification de bout en bout, contre une vraie base.
 * Necessite PostgreSQL demarre et migrations appliquees :
 *   pnpm infra:up && pnpm --filter @sira/api prisma:deploy
 */

const PHONE = '+2250799000001';
const PASSWORD = 'motdepasse-solide';

let app: INestApplication;
let prisma: PrismaService;

async function wipe(): Promise<void> {
  // L'ordre suit les cles etrangeres ; les cascades font le reste.
  await prisma.refreshToken.deleteMany({ where: { user: { phone: PHONE } } });
  await prisma.user.deleteMany({ where: { phone: PHONE } });
  await prisma.organization.deleteMany({ where: { name: 'Livraisons Test' } });
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
  prisma = app.get(PrismaService);
  await wipe();
});

afterAll(async () => {
  if (prisma) await wipe();
  if (app) await app.close();
});

describe('Authentification', () => {
  let refreshToken = '';
  let accessToken = '';

  it('refuse une inscription au numero mal forme', async () => {
    const res = await request(app.getHttpServer()).post('/auth/register').send({
      phone: '0701020304',
      password: PASSWORD,
      fullName: 'Awa Kone',
      organizationName: 'Livraisons Test',
    });
    expect(res.status).toBe(400);
    expect(res.body.errors.map((e: { path: string }) => e.path)).toContain('phone');
  });

  it('inscrit un compte et cree son organisation', async () => {
    const res = await request(app.getHttpServer()).post('/auth/register').send({
      phone: PHONE,
      password: PASSWORD,
      fullName: 'Awa Kone',
      organizationName: 'Livraisons Test',
    });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('admin');
    expect(res.body.user.organizationId).toBeTruthy();
    // Le hachage ne doit jamais sortir de l'API.
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    expect(res.body.accessToken).toBeTruthy();
    refreshToken = res.body.refreshToken;
    accessToken = res.body.accessToken;
  });

  it('refuse un second compte sur le meme numero', async () => {
    const res = await request(app.getHttpServer()).post('/auth/register').send({
      phone: PHONE,
      password: PASSWORD,
      fullName: 'Autre',
      organizationName: 'Autre org',
    });
    expect(res.status).toBe(409);
  });

  it('connecte avec le bon mot de passe', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ phone: PHONE, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.user.phone).toBe(PHONE);
  });

  it('refuse un mot de passe faux sans distinguer du numero inconnu', async () => {
    const mauvaisMotDePasse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ phone: PHONE, password: 'faux-mot-de-passe' });
    const numeroInconnu = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ phone: '+2250799000099', password: PASSWORD });

    expect(mauvaisMotDePasse.status).toBe(401);
    expect(numeroInconnu.status).toBe(401);
    // Meme message : l'API ne doit pas permettre d'enumerer les comptes.
    expect(mauvaisMotDePasse.body.message).toBe(numeroInconnu.body.message);
  });

  it('refuse une route protegee sans jeton', async () => {
    const res = await request(app.getHttpServer()).post('/auth/logout');
    expect(res.status).toBe(401);
  });

  it('laisse passer la sonde de sante sans jeton', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.database).toBe('up');
  });

  it('echange le jeton de rafraichissement et revoque l ancien', async () => {
    const premier = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken });
    expect(premier.status).toBe(200);
    expect(premier.body.refreshToken).not.toBe(refreshToken);

    // Rejouer l'ancien jeton doit echouer : c'est tout l'interet de la rotation.
    const rejeu = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken });
    expect(rejeu.status).toBe(401);

    refreshToken = premier.body.refreshToken;
  });

  it('revoque tous les jetons a la deconnexion', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(204);

    const apres = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken });
    expect(apres.status).toBe(401);
  });
});
