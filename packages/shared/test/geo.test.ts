import { describe, expect, it } from 'vitest';
import {
  ABIDJAN_BBOX,
  COTE_DIVOIRE_BBOX,
  haversineMeters,
  isInside,
  toOsrmCoordinates,
} from '../src/geo.js';

const plateau = { lat: 5.3251, lon: -4.0212 };
const cocodySaintJean = { lat: 5.3457, lon: -3.9958 };

describe('haversineMeters', () => {
  it('renvoie 0 pour un point avec lui-meme', () => {
    expect(haversineMeters(plateau, plateau)).toBe(0);
  });

  it('mesure ~3,6 km a vol d oiseau entre le Plateau et Saint Jean (Cocody)', () => {
    const meters = haversineMeters(plateau, cocodySaintJean);
    expect(meters).toBeGreaterThan(3500);
    expect(meters).toBeLessThan(3750);
  });

  it('est symetrique', () => {
    expect(haversineMeters(plateau, cocodySaintJean)).toBeCloseTo(
      haversineMeters(cocodySaintJean, plateau),
      6,
    );
  });
});

describe('isInside', () => {
  it('place Abidjan dans la Cote d Ivoire', () => {
    expect(isInside(plateau, ABIDJAN_BBOX)).toBe(true);
    expect(isInside(plateau, COTE_DIVOIRE_BBOX)).toBe(true);
  });

  it('rejette un point hors du perimetre pilote', () => {
    // Bouake — extension prevue, hors pilote Abidjan (cadrage §8.3).
    expect(isInside({ lat: 7.69, lon: -5.03 }, ABIDJAN_BBOX)).toBe(false);
    expect(isInside({ lat: 7.69, lon: -5.03 }, COTE_DIVOIRE_BBOX)).toBe(true);
  });
});

describe('toOsrmCoordinates', () => {
  it('serialise en lon,lat — l ordre attendu par OSRM', () => {
    expect(toOsrmCoordinates([plateau, cocodySaintJean])).toBe('-4.0212,5.3251;-3.9958,5.3457');
  });
});
