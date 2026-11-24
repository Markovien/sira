import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { tileManifestSchema } from '@sira/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/** Carte hors-ligne : manifeste et archive, servis aux seuls utilisateurs connectes. */

const ACCOUNT = { phone: '+2250799400001', org: 'Flotte Carte' };
// Contenu arbitraire : l'API sert l'octet pres, elle n'interprete pas l'archive.
const ARCHIVE = Buffer.from('PMTiles\x03' + 'x'.repeat(4096));

let app: INestApplication;
let prisma: PrismaService;
let token = '';
const directory = mkdtempSync(join(tmpdir(), 'sira-tiles-'));
const previousTilesDir = process.env.TILES_DIR;

const md5 = createHash('md5').update(ARCHIVE).digest('hex');
const manifest = {
  version: '20261124',
  file: 'abidjan.pmtiles',
  bytes: ARCHIVE.length,
  md5,
  sha256: createHash('sha256').update(ARCHIVE).digest('hex'),
  maxZoom: 14,
  bbox: { minLat: 5.15, minLon: -4.35, maxLat: 5.55, maxLon: -3.75 },
  attribution: '\u00a9 OpenStreetMap',
};

async function wipe(): Promise<void> {
  await prisma.user.deleteMany({ where: { phone: ACCOUNT.phone } });
  await prisma.organization.deleteMany({ where: { name: ACCOUNT.org } });
}

const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  writeFileSync(join(directory, 'manifest.json'), JSON.stringify(manifest));
  writeFileSync(join(directory, 'abidjan.pmtiles'), ARCHIVE);
  writeFileSync(join(directory, 'secret.txt'), 'ne doit jamais sortir');
  process.env.TILES_DIR = directory;

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
  prisma = app.get(PrismaService);
  await wipe();
  const res = await request(app.getHttpServer()).post('/auth/register').send({
    phone: ACCOUNT.phone,
    password: 'motdepasse-solide',
    fullName: 'Livreur Carte',
    organizationName: ACCOUNT.org,
  });
  token = res.body.accessToken;
});

afterAll(async () => {
  if (prisma) await wipe();
  if (app) await app.close();
  rmSync(directory, { recursive: true, force: true });
  if (previousTilesDir === undefined) delete process.env.TILES_DIR;
  else process.env.TILES_DIR = previousTilesDir;
});

describe('GET /tiles/manifest', () => {
  it('exige une session', async () => {
    await request(app.getHttpServer()).get('/tiles/manifest').expect(401);
  });

  it('renvoie un manifeste conforme au schema partage', async () => {
    const res = await request(app.getHttpServer())
      .get('/tiles/manifest')
      .set(auth())
      .expect(200);
    expect(tileManifestSchema.parse(res.body)).toMatchObject({ md5, file: 'abidjan.pmtiles' });
  });
});

describe('GET /tiles/:file', () => {
  it('exige une session', async () => {
    await request(app.getHttpServer()).get('/tiles/abidjan.pmtiles').expect(401);
  });

  it("sert l'archive a l'octet pres, avec son empreinte en ETag", async () => {
    const res = await request(app.getHttpServer())
      .get('/tiles/abidjan.pmtiles')
      .set(auth())
      .buffer(true)
      .parse((r, done) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(res.headers.etag).toBe(`"${md5}"`);
    expect(res.headers['content-type']).toContain('application/vnd.pmtiles');
    expect(Buffer.compare(res.body as Buffer, ARCHIVE)).toBe(0);
  });

  it('accepte les requetes de plage, pour reprendre un telechargement', async () => {
    const res = await request(app.getHttpServer())
      .get('/tiles/abidjan.pmtiles')
      .set({ ...auth(), Range: 'bytes=0-7' })
      .expect(206);
    expect(res.headers['content-range']).toBe(`bytes 0-7/${ARCHIVE.length}`);
  });

  it('ne sert aucun autre fichier du repertoire', async () => {
    await request(app.getHttpServer()).get('/tiles/secret.txt').set(auth()).expect(404);
    await request(app.getHttpServer()).get('/tiles/manifest.json').set(auth()).expect(404);
    await request(app.getHttpServer())
      .get('/tiles/..%2F..%2Fpackage.json')
      .set(auth())
      .expect(404);
  });
});
