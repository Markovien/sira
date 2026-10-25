import { describe, expect, it } from 'vitest';
import { abidjanLocalTime, fallbackMatrices, speedSlotAt } from '../src/fallback.js';

const plateau = { lat: 5.3251, lon: -4.0212 };
const cocodySaintJean = { lat: 5.3457, lon: -3.9958 };
const yopougon = { lat: 5.3364, lon: -4.0844 };

const at = (dayOfWeek: number, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return { dayOfWeek, minutes: (h ?? 0) * 60 + (m ?? 0) };
};

describe('speedSlotAt', () => {
  it.each([
    [1, '07:00', 'peak'],
    [3, '08:59', 'peak'],
    [5, '17:30', 'peak'],
    [2, '09:00', 'offPeak'],
    [2, '12:00', 'offPeak'],
    [2, '20:00', 'offPeak'],
    [6, '08:00', 'offPeak'],
    [0, '09:00', 'free'],
    [0, '15:00', 'offPeak'],
    [3, '21:00', 'free'],
    [3, '05:59', 'free'],
  ] as const)('jour %i a %s : %s', (day, time, slot) => {
    expect(speedSlotAt(at(day, time))).toBe(slot);
  });
});

describe('abidjanLocalTime', () => {
  it('lit l heure UTC, Abidjan etant en GMT', () => {
    // Lundi 26 octobre 2026, 07h15 a Abidjan.
    expect(abidjanLocalTime(new Date('2026-10-26T07:15:00Z'))).toEqual({
      dayOfWeek: 1,
      minutes: 435,
    });
  });
});

describe('fallbackMatrices', () => {
  const points = [plateau, cocodySaintJean, yopougon];

  it('a une diagonale nulle et est symetrique', () => {
    const { durations, distances } = fallbackMatrices(points, at(2, '12:00'));
    points.forEach((_, i) => {
      expect(durations[i]?.[i]).toBe(0);
      points.forEach((__, j) => expect(distances[i]?.[j]).toBe(distances[j]?.[i]));
    });
  });

  it('applique le detour urbain a la distance a vol d oiseau', () => {
    // ~3,62 km a vol d oiseau, x1,35.
    const meters = fallbackMatrices(points, at(2, '12:00')).distances[0]?.[1] ?? 0;
    expect(meters).toBeGreaterThan(4800);
    expect(meters).toBeLessThan(5050);
  });

  it('allonge les durees en heure de pointe, pas les distances', () => {
    const peak = fallbackMatrices(points, at(1, '08:00'));
    const night = fallbackMatrices(points, at(1, '23:00'));
    expect(peak.slot).toBe('peak');
    expect(night.slot).toBe('free');
    expect(peak.distances).toEqual(night.distances);
    // 12 km/h contre 32 km/h.
    const ratio = (peak.durations[0]?.[1] ?? 0) / (night.durations[0]?.[1] ?? 1);
    expect(ratio).toBeCloseTo(32 / 12, 1);
  });

  it('ne renvoie que des entiers, comme OSRM', () => {
    const { durations, distances } = fallbackMatrices(points, at(4, '10:00'));
    expect([...durations.flat(), ...distances.flat()].every(Number.isInteger)).toBe(true);
  });
});
