import type { Coordinates } from '@sira/shared';

/**
 * Source unique de position pendant une tournee (decisions.md, 02/11/2026) :
 * un abonnement a basse frequence plutot que des lectures GPS a la demande.
 * Rien n'est stocke ni envoye : seule la derniere position vit en memoire.
 */

/** Abonnement aux positions ; null si la permission est refusee. */
export interface PositionSource {
  watch(onPosition: (position: Coordinates) => void): Promise<(() => void) | null>;
}

/** Au-dela, la derniere position ne dit plus ou est le livreur. */
export const MAX_POSITION_AGE_MS = 2 * 60_000;

export function createPositionSampler({
  source,
  now = () => Date.now(),
}: {
  source: PositionSource;
  now?: () => number;
}) {
  let latest: { position: Coordinates; at: number } | null = null;
  let unsubscribe: (() => void) | null = null;
  let starting: Promise<void> | null = null;
  // Un arret demande pendant le demarrage doit l'emporter quand il aboutit.
  let wanted = false;

  return {
    start(): Promise<void> {
      wanted = true;
      if (unsubscribe || starting) return starting ?? Promise.resolve();
      starting = source
        .watch((position) => {
          latest = { position, at: now() };
        })
        .then((stop) => {
          starting = null;
          if (!stop) return;
          if (wanted) unsubscribe = stop;
          else stop();
        });
      return starting;
    },

    stop(): void {
      wanted = false;
      unsubscribe?.();
      unsubscribe = null;
    },

    /** Derniere position si elle est assez recente, sinon null. */
    fresh(): Coordinates | null {
      if (!latest || now() - latest.at > MAX_POSITION_AGE_MS) return null;
      return latest.position;
    },

    get active(): boolean {
      return unsubscribe !== null;
    },
  };
}

export type PositionSampler = ReturnType<typeof createPositionSampler>;
