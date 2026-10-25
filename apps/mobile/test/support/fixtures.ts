import type { Mission, MissionDetail, Stop } from '@sira/shared';

export const STAMP = '2026-10-25T10:00:00.000Z';

export function mission(id: string, overrides: Partial<Mission> = {}): Mission {
  return {
    id,
    label: `Mission ${id}`,
    date: '2026-11-04T00:00:00.000Z',
    status: 'planned',
    driverId: null,
    vehicleId: null,
    startDepotId: null,
    endDepotId: null,
    optimizedAt: null,
    estimatedDurationSeconds: null,
    estimatedDistanceMeters: null,
    startedAt: null,
    completedAt: null,
    updatedAt: STAMP,
    ...overrides,
  };
}

export function stop(id: string, missionId: string, overrides: Partial<Stop> = {}): Stop {
  return {
    id,
    missionId,
    label: `Client ${id}`,
    lat: 5.3457,
    lon: -3.9958,
    addressText: 'Cocody Saint Jean',
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
    sequence: null,
    estimatedArrival: null,
    status: 'pending',
    completedAt: null,
    failureReason: null,
    updatedAt: STAMP,
    ...overrides,
  };
}

export function detail(m: Mission, stops: Stop[]): MissionDetail {
  return { ...m, stops };
}
