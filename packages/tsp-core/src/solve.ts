import { buildInitialTour } from './construct.js';
import { assertSquareMatrix, tourCost } from './cost.js';
import { doubleBridge, improve } from './improve.js';
import { createRandom } from './random.js';
import {
  DEFAULT_TIME_LIMIT_MS,
  type DurationMatrix,
  type TspOptions,
  type TspSolution,
} from './types.js';

/**
 * Resout un TSP sur une matrice de durees.
 *
 * Deux phases : construction gloutonne multi-departs, puis amelioration locale
 * (2-opt et Or-opt) jusqu'a epuisement du budget de temps. Le budget est une
 * garantie, pas une cible — sur une poignee d'arrets la solution tombe en
 * quelques millisecondes.
 *
 * `Date.now` et non `performance.now` : ce code doit tourner dans Hermes, ou
 * l'API de haute resolution n'est pas garantie.
 */
export function solveTsp(matrix: DurationMatrix, options: TspOptions = {}): TspSolution {
  assertSquareMatrix(matrix);

  const n = matrix.length;
  const startIndex = options.startIndex ?? 0;
  if (startIndex < 0 || startIndex >= n) {
    throw new Error(`startIndex ${startIndex} hors de la matrice (taille ${n})`);
  }

  const returnToStart = options.returnToStart ?? false;
  const timeLimitMs = options.timeLimitMs ?? DEFAULT_TIME_LIMIT_MS;
  const seed = options.seed ?? 1;

  const now = () => Date.now();
  const startedAt = now();
  const deadline = startedAt + timeLimitMs;

  const initial = buildInitialTour(matrix, startIndex, returnToStart, seed);
  const first = improve(initial, matrix, returnToStart, deadline, now);

  let bestOrder = first.order;
  let bestCost = first.cost;
  let improvements = first.improvements;

  // Recherche locale iteree. La descente seule s'arrete au premier optimum
  // local, souvent en quelques millisecondes : sur une tournee de dix arrets
  // le budget resterait inutilise. Perturber puis redescendre exploite ce
  // temps disponible, et ne peut pas degrader le resultat puisque seul un
  // tour strictement meilleur remplace le precedent.
  const random = createRandom(seed + 1);
  while (now() < deadline) {
    const perturbed = doubleBridge(bestOrder, random);
    const candidate = improve(perturbed, matrix, returnToStart, deadline, now);
    improvements += candidate.improvements;
    if (candidate.cost < bestCost - 1e-9) {
      bestCost = candidate.cost;
      bestOrder = candidate.order;
    }
  }

  return {
    order: bestOrder,
    // Recalcule une derniere fois : la valeur rendue doit venir de la matrice,
    // jamais d'un cumul de deltas.
    totalDurationSeconds: tourCost(bestOrder, matrix, returnToStart),
    computeTimeMs: now() - startedAt,
    improvements,
  };
}
