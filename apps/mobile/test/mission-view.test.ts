import type { Stop } from '@sira/shared';
import { describe, expect, it } from 'vitest';
import {
  displayedStops,
  routeStopsOf,
  serverOrder,
  startPoint,
} from '../src/core/mission-view';
import { planRoute } from '../src/core/optimize';

const base: Omit<Stop, 'id' | 'lon' | 'sequence' | 'status'> = {
  missionId: 'm1',
  label: 'Client',
  lat: 5.3251,
  addressText: 'Abidjan',
  informalDescription: null,
  landmark: null,
  contactName: null,
  contactPhone: null,
  timeWindowStart: null,
  timeWindowEnd: null,
  loadKg: 0,
  volumeL: 0,
  serviceMinutes: 5,
  priority: 'normal',
  estimatedArrival: null,
  completedAt: null,
  failureReason: null,
  updatedAt: '2026-10-25T10:00:00.000Z',
};

const stop = (
  id: string,
  lon: number,
  sequence: number | null,
  status: Stop['status'] = 'pending',
): Stop => ({
  ...base,
  id,
  lon,
  sequence,
  status,
});

describe('serverOrder', () => {
  it('suit le rang, et met les arrets non classes a la fin dans l ordre recu', () => {
    const stops = [
      stop('x', -4, null),
      stop('b', -4, 2),
      stop('y', -4, null),
      stop('a', -4, 1),
    ];
    expect(serverOrder(stops).map((s) => s.id)).toEqual(['a', 'b', 'x', 'y']);
  });
});

describe('routeStopsOf et startPoint', () => {
  it('ne garde que les arrets a livrer', () => {
    const stops = [
      stop('a', -4.02, 1, 'delivered'),
      stop('b', -4.01, 2),
      stop('c', -4.0, 3, 'failed'),
    ];
    expect(routeStopsOf(stops).map((s) => s.id)).toEqual(['b']);
  });

  it('part du premier arret restant sans position', () => {
    const remaining = routeStopsOf([stop('a', -4.01, 1)]);
    expect(startPoint(null, remaining)).toEqual({ lat: 5.3251, lon: -4.01 });
    expect(startPoint({ lat: 5.3, lon: -4 }, remaining)).toEqual({ lat: 5.3, lon: -4 });
    expect(startPoint(null, [])).toBeNull();
  });
});

describe('displayedStops', () => {
  const stops = [
    stop('loin', -3.97, 1),
    stop('livre', -4.0, 2, 'delivered'),
    stop('proche', -4.01, 3),
  ];
  const departure = new Date('2026-11-04T08:00:00Z');

  it('sans plan, l ordre serveur sans heure d arrivee', () => {
    expect(displayedStops(stops, null).map((d) => [d.stop.id, d.eta])).toEqual([
      ['loin', null],
      ['livre', null],
      ['proche', null],
    ]);
  });

  it('avec un plan, l ordre calcule puis les arrets deja traites', () => {
    const remaining = routeStopsOf(stops);
    const route = planRoute({
      start: { lat: 5.3251, lon: -4.02 },
      stops: remaining,
      departure,
    });
    const shown = displayedStops(stops, { route, departure });
    expect(shown.map((d) => d.stop.id)).toEqual(['proche', 'loin', 'livre']);
    expect(shown[0]?.eta?.getTime()).toBeGreaterThan(departure.getTime());
    expect(shown[2]?.eta).toBeNull();
  });
});
