import { describe, expect, it } from 'vitest';
import { MAX_ONBOARD_STOPS } from '@sira/tsp-core';
import { planRoute, TooManyStopsError, type RouteStop } from '../src/core/optimize';

const depot = { lat: 5.3251, lon: -4.0212 }; // Plateau
// Lundi 26/10/2026 a 10h : hors pointe.
const offPeak = new Date('2026-10-26T10:00:00Z');

// Alignes vers l'est : l'ordre optimal est evident, et donc verifiable.
const east = (id: string, dLon: number, serviceMinutes = 5): RouteStop => ({
  id,
  lat: depot.lat,
  lon: depot.lon + dLon,
  serviceMinutes,
});

describe('planRoute hors connexion', () => {
  const stops = [east('c', 0.03), east('a', 0.01), east('b', 0.02)];

  it('ordonne les arrets et estime la tournee', () => {
    const route = planRoute({ start: depot, stops, departure: offPeak });
    expect(route.stops.map((s) => s.stopId)).toEqual(['a', 'b', 'c']);
    expect(route.source).toBe('fallback');
    expect(route.slot).toBe('offPeak');
    // ~3,3 km a vol d oiseau x 1,35.
    expect(route.distanceMeters).toBeGreaterThan(4300);
    expect(route.distanceMeters).toBeLessThan(4700);
  });

  it('compte le temps de service dans les arrivees et la duree totale', () => {
    const route = planRoute({ start: depot, stops, departure: offPeak });
    const [a, b] = route.stops;
    expect(route.totalSeconds).toBe(route.travelSeconds + 3 * 5 * 60);
    // Entre a et b : un trajet plus les 5 min de service en a.
    expect((b?.arrivalOffsetSeconds ?? 0) - (a?.arrivalOffsetSeconds ?? 0)).toBeGreaterThan(
      300,
    );
  });

  it('est deterministe : deux appuis, le meme ordre', () => {
    const many = Array.from({ length: 15 }, (_, i) => ({
      id: `s${i}`,
      lat: 5.3 + ((i * 37) % 11) / 100,
      lon: -4.05 + ((i * 53) % 13) / 100,
      serviceMinutes: 5,
    }));
    const first = planRoute({ start: depot, stops: many, departure: offPeak });
    const second = planRoute({ start: depot, stops: many, departure: offPeak });
    expect(second.stops).toEqual(first.stops);
    expect(new Set(first.stops.map((s) => s.stopId)).size).toBe(15);
  });

  it('ralentit la tournee en heure de pointe', () => {
    const peak = planRoute({
      start: depot,
      stops,
      departure: new Date('2026-10-26T08:00:00Z'),
    });
    const calm = planRoute({ start: depot, stops, departure: offPeak });
    expect(peak.slot).toBe('peak');
    expect(peak.travelSeconds).toBeGreaterThan(calm.travelSeconds);
  });

  it('accepte une tournee vide', () => {
    const route = planRoute({ start: depot, stops: [], departure: offPeak });
    expect(route.stops).toEqual([]);
    expect(route.totalSeconds).toBe(0);
  });

  it('compte le retour au depot quand il est demande', () => {
    const oneWay = planRoute({ start: depot, stops, departure: offPeak });
    const loop = planRoute({ start: depot, stops, departure: offPeak, returnToStart: true });
    expect(loop.distanceMeters).toBeGreaterThan(oneWay.distanceMeters);
    expect(loop.stops).toHaveLength(3);
  });

  it('renvoie au serveur au-dela de la limite embarquee', () => {
    const tooMany = Array.from({ length: MAX_ONBOARD_STOPS + 1 }, (_, i) =>
      east(`s${i}`, i / 1e4),
    );
    expect(() => planRoute({ start: depot, stops: tooMany, departure: offPeak })).toThrow(
      TooManyStopsError,
    );
  });
});

describe('planRoute avec les matrices OSRM', () => {
  const stops = [east('a', 0.01), east('b', 0.02)];
  // Une route reelle peut rendre b plus proche que a : la matrice fait foi.
  const routed = {
    durations: [
      [0, 900, 300],
      [900, 0, 600],
      [300, 600, 0],
    ],
    distances: [
      [0, 9000, 3000],
      [9000, 0, 6000],
      [3000, 6000, 0],
    ],
  };

  it('suit la matrice fournie plutot que le vol d oiseau', () => {
    const route = planRoute({ start: depot, stops, departure: offPeak, routed });
    expect(route.source).toBe('osrm');
    expect(route.slot).toBeNull();
    expect(route.stops.map((s) => s.stopId)).toEqual(['b', 'a']);
    expect(route.travelSeconds).toBe(900);
    expect(route.distanceMeters).toBe(9000);
  });

  it('refuse une matrice de mauvaise taille', () => {
    expect(() =>
      planRoute({ start: depot, stops: [stops[0]!], departure: offPeak, routed }),
    ).toThrow(/taille/);
  });
});
