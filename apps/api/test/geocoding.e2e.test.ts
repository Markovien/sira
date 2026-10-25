import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { haversineMeters } from '@sira/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { AddressBookService } from '../src/geocoding/address-book.service';
import { PhotonService } from '../src/geocoding/photon.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Alimentation et interrogation de la base d'adresses proprietaire.
 * C'est le mecanisme du moat (cadrage §10.1) : chaque livraison confirmee
 * geocode une adresse informelle.
 */

const ACCOUNT = { phone: '+2250799300001', org: 'Flotte Geocodage' };
const PASSWORD = 'motdepasse-solide';

const SAINT_JEAN = { lat: 5.3457, lon: -3.9958 };

let app: INestApplication;
let prisma: PrismaService;
let addressBook: AddressBookService;
let token = '';
let organizationId = '';

async function wipe(): Promise<void> {
  await prisma.user.deleteMany({ where: { phone: ACCOUNT.phone } });
  await prisma.organization.deleteMany({ where: { name: ACCOUNT.org } });
}

const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
  prisma = app.get(PrismaService);
  addressBook = app.get(AddressBookService);
  await wipe();

  const res = await request(app.getHttpServer()).post('/auth/register').send({
    phone: ACCOUNT.phone,
    password: PASSWORD,
    fullName: 'Dispatcheur',
    organizationName: ACCOUNT.org,
  });
  token = res.body.accessToken;
  organizationId = res.body.user.organizationId;
});

afterAll(async () => {
  if (prisma) await wipe();
  if (app) await app.close();
});

async function createDeliveredStop(point: { lat: number; lon: number }, label: string) {
  const mission = await request(app.getHttpServer())
    .post('/missions')
    .set(auth())
    .send({ date: '2026-11-04' });

  const stop = await request(app.getHttpServer())
    .post(`/missions/${mission.body.id}/stops`)
    .set(auth())
    .send({
      label,
      lat: point.lat,
      lon: point.lon,
      addressText: 'Carrefour Saint Jean, Cocody',
      informalDescription: 'En face de la station, portail bleu a cote du maquis',
    });

  const delivered = await request(app.getHttpServer())
    .patch(`/missions/${mission.body.id}/stops/${stop.body.id}`)
    .set(auth())
    .send({ status: 'delivered' });

  expect(delivered.status).toBe(200);
  return { missionId: mission.body.id, stopId: stop.body.id };
}

describe('Base d adresses proprietaire', () => {
  it('cree une adresse a la premiere livraison confirmee', async () => {
    const { stopId } = await createDeliveredStop(SAINT_JEAN, 'Pharmacie Saint Jean');

    const addresses = await prisma.address.findMany({ where: { organizationId } });
    expect(addresses).toHaveLength(1);
    expect(addresses[0]?.confirmationCount).toBe(1);
    expect(addresses[0]?.informalDescription).toMatch(/portail bleu/);

    // L'arret est rattache a l'adresse creee : c'est ce lien qui permettra de
    // retrouver la description informelle lors d'une prochaine livraison.
    const stop = await prisma.stop.findUniqueOrThrow({ where: { id: stopId } });
    expect(stop.addressId).toBe(addresses[0]?.id);
  });

  it('agrege une seconde livraison au meme endroit plutot que de dupliquer', async () => {
    // ~12 m du premier point : dispersion normale d'un GPS de smartphone.
    await createDeliveredStop({ lat: 5.34581, lon: -3.99588 }, 'Pharmacie Saint Jean');

    const addresses = await prisma.address.findMany({ where: { organizationId } });
    expect(addresses).toHaveLength(1);
    expect(addresses[0]?.confirmationCount).toBe(2);
  });

  it('affine la position par moyenne mobile, sans jamais s eloigner', async () => {
    const avant = await prisma.address.findFirstOrThrow({ where: { organizationId } });
    await createDeliveredStop({ lat: 5.3459, lon: -3.9957 }, 'Pharmacie Saint Jean');
    const apres = await prisma.address.findFirstOrThrow({ where: { organizationId } });

    expect(apres.confirmationCount).toBe(3);
    // La position bouge, mais reste dans le rayon d'agregation.
    expect(haversineMeters(avant, apres)).toBeGreaterThan(0);
    expect(haversineMeters(SAINT_JEAN, apres)).toBeLessThan(30);
  });

  it('cree une adresse distincte au-dela du rayon d agregation', async () => {
    // Le Plateau, a plusieurs kilometres : rien a voir avec Saint Jean.
    await createDeliveredStop({ lat: 5.3251, lon: -4.0212 }, 'Pharmacie du Plateau');
    const addresses = await prisma.address.findMany({ where: { organizationId } });
    expect(addresses).toHaveLength(2);
  });

  it('n enregistre rien sur un echec de livraison', async () => {
    const avant = await prisma.address.count({ where: { organizationId } });

    const mission = await request(app.getHttpServer())
      .post('/missions')
      .set(auth())
      .send({ date: '2026-11-04' });
    const stop = await request(app.getHttpServer())
      .post(`/missions/${mission.body.id}/stops`)
      .set(auth())
      .send({ label: 'Absent', lat: 5.3, lon: -4.03, addressText: 'Treichville' });
    await request(app.getHttpServer())
      .patch(`/missions/${mission.body.id}/stops/${stop.body.id}`)
      .set(auth())
      .send({ status: 'failed', failureReason: 'Destinataire absent' })
      .expect(200);

    // Un echec ne prouve rien sur l'exactitude du point.
    expect(await prisma.address.count({ where: { organizationId } })).toBe(avant);
  });

  it('retrouve une adresse par recherche floue, accents et fautes compris', async () => {
    const res = await request(app.getHttpServer())
      .get('/geocoding/search')
      .query({ q: 'pharmacie st jean' })
      .set(auth());

    expect(res.status).toBe(200);
    const propres = res.body.candidates.filter(
      (c: { source: string }) => c.source === 'address-book',
    );
    expect(propres.length).toBeGreaterThan(0);
    expect(propres[0].label).toMatch(/Saint Jean/i);
    expect(propres[0].confirmations).toBeGreaterThanOrEqual(3);
  });

  it('signale un geocodage degrade quand Photon est injoignable', async () => {
    // PhotonService renvoie une liste vide quand Photon est injoignable
    // (photon.test.ts). On le force ici : un Photon demarre en local — il
    // l'est depuis que son index est telechargeable — ne doit pas faire
    // echouer ce test.
    vi.spyOn(app.get(PhotonService), 'search').mockResolvedValueOnce([]);
    const res = await request(app.getHttpServer())
      .get('/geocoding/search')
      .query({ q: 'pharmacie st jean' })
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.photonAvailable).toBe(false);
  });

  it('remonte les adresses connues autour d un point', async () => {
    const res = await request(app.getHttpServer())
      .post('/geocoding/nearby')
      .set(auth())
      .send({ ...SAINT_JEAN, radiusMeters: 100 });

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].source).toBe('address-book');
    expect(res.body[0].label).toMatch(/Saint Jean/);
  });

  it('cloisonne la base entre organisations', async () => {
    const autre = await prisma.organization.create({ data: { name: 'Organisation tierce' } });
    try {
      const resultats = await addressBook.searchByText(autre.id, 'pharmacie');
      expect(resultats).toEqual([]);
    } finally {
      await prisma.organization.delete({ where: { id: autre.id } });
    }
  });
});
