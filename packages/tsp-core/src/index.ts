/**
 * @sira/tsp-core — solveur TSP embarquable.
 *
 * Phase 0 : contrat d'interface uniquement. L'implementation (plus proche
 * voisin multi-departs + 2-opt / Or-opt) arrive en Phase 2 de la roadmap.
 *
 * Contrainte non negociable : TypeScript pur, zero dependance native, afin de
 * tourner tel quel dans React Native sur un Android d'entree de gamme.
 */

/** Matrice carree des durees de trajet en secondes, indexee [origine][destination]. */
export type DurationMatrix = readonly (readonly number[])[];

export interface TspOptions {
  /** Index du point de depart (depot). Defaut : 0. */
  readonly startIndex?: number;
  /** Retour au point de depart en fin de tournee. Defaut : false (livreur qui rentre chez lui). */
  readonly returnToStart?: boolean;
  /** Budget de calcul pour la phase d'amelioration, en millisecondes. */
  readonly timeLimitMs?: number;
  /** Graine du generateur aleatoire, pour des resultats reproductibles en test. */
  readonly seed?: number;
}

export interface TspSolution {
  /** Ordre de visite : indices dans la matrice fournie, depart inclus. */
  readonly order: readonly number[];
  /** Duree totale estimee en secondes, hors temps de service. */
  readonly totalDurationSeconds: number;
  /** Temps de calcul reellement consomme. */
  readonly computeTimeMs: number;
  /** Nombre d'ameliorations locales appliquees — utile au benchmark. */
  readonly improvements: number;
}

/** Budget par defaut de la phase d'amelioration (roadmap Phase 2.1). */
export const DEFAULT_TIME_LIMIT_MS = 800;

/** Taille au-dela de laquelle l'optimisation bascule cote serveur. */
export const MAX_ONBOARD_STOPS = 100;
