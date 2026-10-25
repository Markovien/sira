import { FALLBACK_URBAN_SPEEDS_KMH, URBAN_DETOUR_FACTOR } from './domain.js';
import { haversineMeters, type Coordinates } from './geo.js';

/**
 * Estimation des trajets sans OSRM (roadmap Phase 3.4) : le mobile hors-ligne,
 * et l'API si son routeur tombe. Voir decisions.md (25/10/2026) pour le choix
 * d'une vitesse unique par tournee.
 */

export type SpeedSlot = keyof typeof FALLBACK_URBAN_SPEEDS_KMH;

/** Jour et heure locaux. 0 = dimanche, comme `Date.getUTCDay()`. */
export interface LocalTime {
  readonly dayOfWeek: number;
  /** Minutes depuis minuit, 0 a 1439. */
  readonly minutes: number;
}

const MORNING_PEAK = [7 * 60, 9 * 60] as const;
const EVENING_PEAK = [17 * 60, 20 * 60] as const;
const NIGHT_FROM = 21 * 60;
const NIGHT_UNTIL = 6 * 60;
const SUNDAY_QUIET_UNTIL = 12 * 60;

const within = (minutes: number, [from, until]: readonly [number, number]): boolean =>
  minutes >= from && minutes < until;

export function speedSlotAt({ dayOfWeek, minutes }: LocalTime): SpeedSlot {
  if (minutes >= NIGHT_FROM || minutes < NIGHT_UNTIL) return 'free';
  if (dayOfWeek === 0) return minutes < SUNDAY_QUIET_UNTIL ? 'free' : 'offPeak';
  // Le samedi a son trafic, mais sans les migrations pendulaires des ponts.
  const weekday = dayOfWeek >= 1 && dayOfWeek <= 5;
  if (weekday && (within(minutes, MORNING_PEAK) || within(minutes, EVENING_PEAK)))
    return 'peak';
  return 'offPeak';
}

/**
 * Abidjan vit en GMT toute l'annee, sans heure d'ete : l'heure locale est
 * l'heure UTC. Ce raccourci ne vaut pas pour le reste de l'UEMOA — le Niger et
 * le Benin sont en GMT+1 — et devra prendre un decalage le jour ou SIRA en sort.
 */
export function abidjanLocalTime(date: Date): LocalTime {
  return {
    dayOfWeek: date.getUTCDay(),
    minutes: date.getUTCHours() * 60 + date.getUTCMinutes(),
  };
}

export interface FallbackMatrices {
  /** Secondes, entieres, indexees [origine][destination]. */
  readonly durations: number[][];
  /** Metres, entiers, distance routiere estimee. */
  readonly distances: number[][];
  readonly slot: SpeedSlot;
}

export function fallbackMatrices(
  points: readonly Coordinates[],
  departure: LocalTime,
): FallbackMatrices {
  const slot = speedSlotAt(departure);
  const metersPerSecond = (FALLBACK_URBAN_SPEEDS_KMH[slot] * 1000) / 3600;

  const distances = points.map((from) =>
    points.map((to) => Math.round(haversineMeters(from, to) * URBAN_DETOUR_FACTOR)),
  );
  const durations = distances.map((row) =>
    row.map((meters) => Math.round(meters / metersPerSecond)),
  );

  return { durations, distances, slot };
}
