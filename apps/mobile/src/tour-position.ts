import type { Coordinates } from '@sira/shared';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { createPositionSampler } from './core/position-sampler';
import { currentPosition, tourPositionSource } from './platform/location';

// Un seul echantillonneur pour toute l'app : deux ecrans ouverts ne doivent
// pas doubler les reveils du GPS.
const sampler = createPositionSampler({ source: tourPositionSource });

/**
 * Active l'echantillonnage tant que `active` est vrai et que l'app est au
 * premier plan ; l'arrete sinon. A appeler depuis l'ecran d'une tournee.
 */
export function useTourPosition(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const apply = (state: string | null | undefined) => {
      if (state === 'active') void sampler.start();
      else sampler.stop();
    };
    apply(AppState.currentState);
    const subscription = AppState.addEventListener('change', apply);
    return () => {
      subscription.remove();
      sampler.stop();
    };
  }, [active]);
}

/** Position du livreur : la derniere echantillonnee si recente, sinon une lecture. */
export async function tourPosition(): Promise<Coordinates | null> {
  return sampler.fresh() ?? (await currentPosition());
}
