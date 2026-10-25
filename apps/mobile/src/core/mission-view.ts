import type { Coordinates, Stop } from '@sira/shared';
import type { OnDeviceRoute, RouteStop } from './optimize';

/** Ordre affiche avant toute optimisation locale : celui du serveur, puis l'ordre de creation. */
export function serverOrder(stops: readonly Stop[]): Stop[] {
  // Tri stable : a rang egal ou absent, l'ordre recu (createdAt) est conserve.
  return [...stops].sort((a, b) => (a.sequence ?? Infinity) - (b.sequence ?? Infinity));
}

/** Seuls les arrets encore a livrer entrent dans un calcul d'ordre. */
export function routeStopsOf(stops: readonly Stop[]): RouteStop[] {
  return stops
    .filter((stop) => stop.status === 'pending')
    .map(({ id, lat, lon, serviceMinutes }) => ({ id, lat, lon, serviceMinutes }));
}

/** Depart : la position du livreur, a defaut le premier arret restant. */
export function startPoint(
  position: Coordinates | null,
  stops: readonly RouteStop[],
): Coordinates | null {
  if (position) return position;
  const first = stops[0];
  return first ? { lat: first.lat, lon: first.lon } : null;
}

export interface DisplayedStop {
  readonly stop: Stop;
  /** Arrivee estimee, si un calcul local l'a fournie. */
  readonly eta: Date | null;
}

/**
 * Arrets dans l'ordre du plan local s'il existe : d'abord ceux qu'il a
 * ordonnes, puis ceux qu'il ignore (deja livres, en echec) dans l'ordre serveur.
 */
export function displayedStops(
  stops: readonly Stop[],
  plan: { route: OnDeviceRoute; departure: Date } | null,
): DisplayedStop[] {
  const ordered = serverOrder(stops);
  if (!plan) return ordered.map((stop) => ({ stop, eta: null }));

  const byId = new Map(ordered.map((stop) => [stop.id, stop]));
  const planned: DisplayedStop[] = [];
  for (const { stopId, arrivalOffsetSeconds } of plan.route.stops) {
    const stop = byId.get(stopId);
    if (!stop) continue;
    planned.push({
      stop,
      eta: new Date(plan.departure.getTime() + arrivalOffsetSeconds * 1000),
    });
    byId.delete(stopId);
  }
  return [...planned, ...[...byId.values()].map((stop) => ({ stop, eta: null }))];
}
