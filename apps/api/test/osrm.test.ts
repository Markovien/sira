import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Env } from '../src/config/env';
import { OsrmService } from '../src/routing/osrm.service';

/**
 * Teste le client contre un faux serveur OSRM local, sans dependance de
 * simulation : les reponses sont celles d'OSRM, les chemins recus sont
 * verifies. La chaine OSRM reelle est couverte a part par
 * infra/osrm/verify-pipeline.sh.
 */

let server: Server;
let baseUrl = '';
/** Chemins recus, pour verifier l'ordre lon,lat et les options envoyees. */
let received: string[] = [];
/** Reponse que le faux serveur doit renvoyer au prochain appel. */
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

function makeService(url = baseUrl): OsrmService {
  return new OsrmService({ OSRM_URL: url } as Env);
}

const plateau = { lat: 5.3251, lon: -4.0212 };
const cocody = { lat: 5.3457, lon: -3.9958 };

describe('OsrmService.route', () => {
  it('envoie les coordonnees en lon,lat et non l inverse', async () => {
    received = [];
    nextResponse = {
      status: 200,
      body: { code: 'Ok', routes: [{ duration: 201, distance: 3628.3, geometry: 'abc' }] },
    };

    const result = await makeService().route([plateau, cocody]);

    // L'inversion lat/lon ne provoque pas d'erreur, seulement un itineraire
    // au mauvais endroit : c'est le chemin envoye qu'il faut verifier.
    expect(received[0]).toContain('-4.0212,5.3251;-3.9958,5.3457');
    expect(result).toEqual({ durationSeconds: 201, distanceMeters: 3628.3, geometry: 'abc' });
  });

  it('omet la trace quand elle n est pas demandee', async () => {
    received = [];
    nextResponse = {
      status: 200,
      body: { code: 'Ok', routes: [{ duration: 1, distance: 2 }] },
    };
    const result = await makeService().route([plateau, cocody], { geometry: false });
    expect(received[0]).toContain('overview=false');
    expect(result.geometry).toBeNull();
  });

  it('exige au moins deux points', async () => {
    await expect(makeService().route([plateau])).rejects.toThrow(/deux points/);
  });

  it('traduit NoRoute en 422 avec un message actionnable', async () => {
    nextResponse = { status: 400, body: { code: 'NoRoute', message: 'Impossible route' } };
    await expect(makeService().route([plateau, cocody])).rejects.toMatchObject({
      status: 422,
    });
  });

  it('traduit NoSegment en invitant a verifier les coordonnees', async () => {
    nextResponse = { status: 400, body: { code: 'NoSegment' } };
    await expect(makeService().route([plateau, cocody])).rejects.toThrow(/coordonnees/);
  });

  it('renvoie 503 quand OSRM est injoignable', async () => {
    // Port ferme : l'infrastructure est en cause, pas la requete.
    const service = makeService('http://127.0.0.1:1');
    await expect(service.route([plateau, cocody])).rejects.toMatchObject({ status: 503 });
  });
});

describe('OsrmService.table', () => {
  it('renvoie la matrice des durees', async () => {
    received = [];
    nextResponse = {
      status: 200,
      body: {
        code: 'Ok',
        durations: [
          [0, 48.6],
          [48.6, 0],
        ],
      },
    };
    const result = await makeService().table([plateau, cocody]);
    expect(result.durations).toEqual([
      [0, 48.6],
      [48.6, 0],
    ]);
    expect(result.distances).toBeUndefined();
    expect(received[0]).toContain('annotations=duration');
  });

  it('ne demande les distances que si on les veut', async () => {
    received = [];
    nextResponse = {
      status: 200,
      body: {
        code: 'Ok',
        durations: [
          [0, 1],
          [1, 0],
        ],
        distances: [
          [0, 10],
          [10, 0],
        ],
      },
    };
    const result = await makeService().table([plateau, cocody], { withDistances: true });
    expect(received[0]).toContain('duration%2Cdistance');
    expect(result.distances).toEqual([
      [0, 10],
      [10, 0],
    ]);
  });

  it('refuse plus de 100 points avant d appeler OSRM', async () => {
    received = [];
    const trop = Array.from({ length: 101 }, () => plateau);
    await expect(makeService().table(trop)).rejects.toThrow(/100 points/);
    // Rien ne doit partir sur le reseau : la limite est connue d avance.
    expect(received).toHaveLength(0);
  });
});
