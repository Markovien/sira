import {
  abidjanLocalTime,
  fallbackMatrices,
  type Coordinates,
  type SpeedSlot,
} from '@sira/shared';
import { MAX_ONBOARD_STOPS, solveTsp } from '@sira/tsp-core';

/**
 * Optimisation embarquee (roadmap Phase 3.4). Le meme appel sert au calcul
 * initial et au « re-calcul de l'ordre restant en un tap » : il suffit de
 * passer la position courante et les seuls arrets encore a livrer.
 */

export interface RouteStop extends Coordinates {
  readonly id: string;
  readonly serviceMinutes: number;
}

/** Matrices fournies par OSRM, point de depart en index 0 puis les arrets. */
export interface RoutedMatrices {
  readonly durations: readonly (readonly number[])[];
  readonly distances: readonly (readonly number[])[];
}

export interface OnDeviceRouteInput {
  readonly start: Coordinates;
  readonly stops: readonly RouteStop[];
  readonly departure: Date;
  /** Absentes hors connexion : on bascule alors sur l'estimation de repli. */
  readonly routed?: RoutedMatrices;
  readonly returnToStart?: boolean;
  readonly timeLimitMs?: number;
}

export interface PlannedStop {
  readonly stopId: string;
  /** Arrivee estimee, en secondes apres le depart. */
  readonly arrivalOffsetSeconds: number;
}

export interface OnDeviceRoute {
  readonly stops: readonly PlannedStop[];
  readonly travelSeconds: number;
  /** Trajet plus temps de service : ce que le livreur voit comme « duree ». */
  readonly totalSeconds: number;
  readonly distanceMeters: number;
  readonly source: 'osrm' | 'fallback';
  /** Tranche horaire retenue, en repli seulement. */
  readonly slot: SpeedSlot | null;
}

export class TooManyStopsError extends Error {
  constructor(readonly count: number) {
    super(
      `${count} arrets : au-dela de ${MAX_ONBOARD_STOPS}, l'optimisation se fait sur le serveur`,
    );
  }
}

/** Budget plus court que celui du serveur : le livreur attend, l'ecran aussi. */
const ONBOARD_TIME_LIMIT_MS = 500;

export function planRoute(input: OnDeviceRouteInput): OnDeviceRoute {
  const { start, stops, departure, routed } = input;
  if (stops.length > MAX_ONBOARD_STOPS) throw new TooManyStopsError(stops.length);

  const points = [start, ...stops];
  let durations: readonly (readonly number[])[];
  let distances: readonly (readonly number[])[];
  let slot: SpeedSlot | null = null;

  if (routed) {
    if (
      routed.durations.length !== points.length ||
      routed.distances.length !== points.length
    ) {
      throw new Error(
        `Matrices OSRM de taille ${routed.durations.length}, ${points.length} attendue`,
      );
    }
    ({ durations, distances } = routed);
  } else {
    const fallback = fallbackMatrices(points, abidjanLocalTime(departure));
    ({ durations, distances, slot } = fallback);
  }

  const returnToStart = input.returnToStart ?? false;
  const order =
    stops.length === 0
      ? [0]
      : solveTsp(durations, {
          startIndex: 0,
          returnToStart,
          timeLimitMs: input.timeLimitMs ?? ONBOARD_TIME_LIMIT_MS,
          // Graine fixe : deux appuis successifs sur « Optimiser » doivent
          // donner le meme ordre, sinon le livreur ne fait plus confiance.
          // Le budget etant en temps, pas en iterations, ce n'est garanti que
          // si la recherche converge avant l'echeance : mesure a 10/10 a 15
          // arrets, 8/10 a 20 (budget de 50 ms contre 500 ms, le 25/10/2026).
          seed: 42,
        }).order;

  const legs = returnToStart && stops.length > 0 ? [...order, 0] : order;
  const planned: PlannedStop[] = [];
  let clock = 0;
  let travelSeconds = 0;
  let distanceMeters = 0;

  for (let k = 1; k < legs.length; k += 1) {
    const from = legs[k - 1]!;
    const to = legs[k]!;
    const leg = durations[from]![to]!;
    travelSeconds += leg;
    distanceMeters += distances[from]![to]!;
    clock += leg;
    if (to === 0) continue;
    planned.push({ stopId: stops[to - 1]!.id, arrivalOffsetSeconds: Math.round(clock) });
    clock += stops[to - 1]!.serviceMinutes * 60;
  }

  return {
    stops: planned,
    travelSeconds: Math.round(travelSeconds),
    totalSeconds: Math.round(clock),
    distanceMeters: Math.round(distanceMeters),
    source: routed ? 'osrm' : 'fallback',
    slot,
  };
}
