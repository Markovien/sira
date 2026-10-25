import { describe, expect, it } from 'vitest';
import { missionDetailSchema, missionListSchema } from '../src/responses.js';

const mission = {
  id: 'm1',
  organizationId: 'o1',
  label: 'Tournee du matin',
  date: '2026-11-04T00:00:00.000Z',
  status: 'planned',
  driverId: 'u1',
  vehicleId: null,
  startDepotId: null,
  endDepotId: null,
  optimizedAt: null,
  estimatedDurationSeconds: null,
  estimatedDistanceMeters: null,
  startedAt: null,
  completedAt: null,
  createdAt: '2026-10-25T10:00:00.000Z',
  updatedAt: '2026-10-25T10:00:00.000Z',
};

const stop = {
  id: 's1',
  missionId: 'm1',
  label: 'Pharmacie',
  lat: 5.3457,
  lon: -3.9958,
  addressText: 'Cocody Saint Jean',
  informalDescription: 'Portail bleu, face au maquis',
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
  proofPhotoUrl: null,
  addressId: null,
  updatedAt: '2026-10-25T10:00:00.000Z',
};

describe('missionListSchema', () => {
  it('aplatit le compte des arrets', () => {
    const list = missionListSchema.parse({
      missions: [{ ...mission, _count: { stops: 15 } }],
      nextCursor: null,
    });
    expect(list.missions[0]?.stopCount).toBe(15);
    expect(list.missions[0]).not.toHaveProperty('_count');
  });
});

describe('missionDetailSchema', () => {
  it('ignore les champs que le client ne connait pas', () => {
    const detail = missionDetailSchema.parse({ ...mission, stops: [stop], futureField: 1 });
    expect(detail).not.toHaveProperty('futureField');
    expect(detail.stops[0]).not.toHaveProperty('addressId');
  });

  it('refuse un statut inconnu plutot que de le stocker', () => {
    expect(
      missionDetailSchema.safeParse({ ...mission, status: 'archived', stops: [] }).success,
    ).toBe(false);
  });
});
