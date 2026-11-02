import type { Coordinates } from '@sira/shared';
import { describe, expect, it } from 'vitest';
import {
  createPositionSampler,
  MAX_POSITION_AGE_MS,
  type PositionSource,
} from '../src/core/position-sampler';

function fakeSource(granted = true) {
  const state = { subscriptions: 0, stopped: 0, emit: (_p: Coordinates) => {} };
  const source: PositionSource = {
    watch(onPosition) {
      if (!granted) return Promise.resolve(null);
      state.subscriptions += 1;
      state.emit = onPosition;
      return Promise.resolve(() => {
        state.stopped += 1;
      });
    },
  };
  return { source, state };
}

const plateau = { lat: 5.3251, lon: -4.0212 };

describe('createPositionSampler', () => {
  it('garde la derniere position tant qu elle est fraiche', async () => {
    let clock = 0;
    const { source, state } = fakeSource();
    const sampler = createPositionSampler({ source, now: () => clock });
    await sampler.start();
    expect(sampler.fresh()).toBeNull();

    state.emit(plateau);
    clock += MAX_POSITION_AGE_MS;
    expect(sampler.fresh()).toEqual(plateau);
    clock += 1;
    expect(sampler.fresh()).toBeNull();
  });

  it('ne s abonne qu une fois, et se desabonne a l arret', async () => {
    const { source, state } = fakeSource();
    const sampler = createPositionSampler({ source });
    await Promise.all([sampler.start(), sampler.start()]);
    await sampler.start();
    expect(state.subscriptions).toBe(1);
    expect(sampler.active).toBe(true);
    sampler.stop();
    expect(state.stopped).toBe(1);
    expect(sampler.active).toBe(false);
  });

  it('respecte un arret demande pendant le demarrage', async () => {
    const { source, state } = fakeSource();
    const sampler = createPositionSampler({ source });
    const starting = sampler.start();
    sampler.stop();
    await starting;
    expect(state.stopped).toBe(1);
    expect(sampler.active).toBe(false);
  });

  it('reste inactif sans permission', async () => {
    const sampler = createPositionSampler({ source: fakeSource(false).source });
    await sampler.start();
    expect(sampler.active).toBe(false);
    expect(sampler.fresh()).toBeNull();
  });
});
