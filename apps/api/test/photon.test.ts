import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Env } from '../src/config/env';
import { PhotonService } from '../src/geocoding/photon.service';

/**
 * Photon n'etant pas demarre dans l'environnement de test, seul son chemin
 * d'echec etait exerce. Ce faux serveur couvre l'analyse des reponses — c'est
 * la que se cache l'inversion lon/lat du GeoJSON.
 */

let server: Server;
let baseUrl = '';
let received: string[] = [];
let nextResponse: { status: number; body: unknown } = { status: 200, body: {} };

beforeAll(async () => {
  server = createServer((req, res) => {
    received.push(req.url ?? '');
    res.writeHead(nextResponse.status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(nextResponse.body));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const makeService = (url = baseUrl) => new PhotonService({ PHOTON_URL: url } as Env);

const feature = (props: Record<string, unknown>, coordinates: [number, number]) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates },
  properties: props,
});

describe('PhotonService', () => {
  it('lit le GeoJSON en [lon, lat] et non l inverse', async () => {
    received = [];
    nextResponse = {
      status: 200,
      // GeoJSON ordonne [lon, lat] : Saint Jean est a lon -3.9958, lat 5.3457.
      body: {
        features: [
          feature(
            { name: 'Pharmacie Saint Jean', district: 'Cocody', city: 'Abidjan' },
            [-3.9958, 5.3457],
          ),
        ],
      },
    };

    const [candidate] = await makeService().search('pharmacie saint jean');
    expect(candidate).toMatchObject({
      lat: 5.3457,
      lon: -3.9958,
      source: 'photon',
      city: 'Abidjan',
      commune: 'Cocody',
    });
  });

  it('biaise la recherche vers Abidjan et demande le francais', async () => {
    received = [];
    nextResponse = { status: 200, body: { features: [] } };
    await makeService().search('pharmacie');

    const url = received[0] ?? '';
    expect(url).toContain('lang=fr');
    // Sans biais geographique, « pharmacie » remonterait Paris avant Abidjan.
    expect(url).toMatch(/lat=5\.3/);
    expect(url).toMatch(/lon=-4\.0/);
  });

  it('compose le libelle a partir du nom, de la rue et du quartier', async () => {
    nextResponse = {
      status: 200,
      body: {
        features: [
          feature({ name: 'Sococe', street: 'Boulevard Latrille' }, [-3.9964, 5.3672]),
        ],
      },
    };
    const [candidate] = await makeService().search('sococe');
    expect(candidate?.label).toBe('Sococe, Boulevard Latrille');
  });

  it('ignore les resultats sans geometrie ou sans libelle exploitable', async () => {
    nextResponse = {
      status: 200,
      body: {
        features: [
          { type: 'Feature', properties: { name: 'Sans position' } },
          feature({ osm_id: 42 }, [-4.01, 5.33]),
          feature({ name: 'Valide' }, [-4.01, 5.33]),
        ],
      },
    };
    const results = await makeService().search('x');
    expect(results).toHaveLength(1);
    expect(results[0]?.label).toBe('Valide');
  });

  it('renvoie une liste vide sur une erreur HTTP, sans lever', async () => {
    nextResponse = { status: 503, body: { message: 'indisponible' } };
    // Une panne de Photon doit degrader vers la base proprietaire, pas casser
    // la recherche.
    await expect(makeService().search('x')).resolves.toEqual([]);
  });

  it('renvoie une liste vide quand Photon est injoignable', async () => {
    await expect(makeService('http://127.0.0.1:1').search('x')).resolves.toEqual([]);
  });

  it('respecte la limite demandee', async () => {
    received = [];
    nextResponse = { status: 200, body: { features: [] } };
    await makeService().search('x', 12);
    expect(received[0]).toContain('limit=12');
  });
});
