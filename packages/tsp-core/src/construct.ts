import { at, tourCost } from './cost.js';
import { createRandom } from './random.js';
import type { DurationMatrix } from './types.js';

/**
 * Construction du tour initial : plus proche voisin, multi-departs.
 *
 * Le plus proche voisin seul donne un tour mediocre et tres dependant du point
 * de depart — il peut depasser l'optimum de 25 %. En varier le depart puis
 * garder le meilleur coute peu et donne a la phase d'amelioration un bien
 * meilleur point de depart.
 */

/** Tour glouton depuis `start`, en choisissant a chaque pas le plus proche. */
export function nearestNeighbour(
  matrix: DurationMatrix,
  start: number,
  random?: () => number,
): number[] {
  const n = matrix.length;
  const visited = new Array<boolean>(n).fill(false);
  const order: number[] = [start];
  visited[start] = true;

  let current = start;
  for (let step = 1; step < n; step += 1) {
    let best = -1;
    let bestCost = Number.POSITIVE_INFINITY;
    // Second meilleur, pour la variante randomisee.
    let runnerUp = -1;
    let runnerUpCost = Number.POSITIVE_INFINITY;

    for (let candidate = 0; candidate < n; candidate += 1) {
      if (visited[candidate]) continue;
      const cost = at(matrix, current, candidate);
      if (cost < bestCost) {
        runnerUp = best;
        runnerUpCost = bestCost;
        best = candidate;
        bestCost = cost;
      } else if (cost < runnerUpCost) {
        runnerUp = candidate;
        runnerUpCost = cost;
      }
    }

    // Un glouton strict se bloque toujours dans les memes impasses. Prendre
    // parfois le second plus proche diversifie les departs sans degrader
    // franchement la qualite.
    const chosen =
      random && runnerUp >= 0 && random() < 0.25 ? runnerUp : best >= 0 ? best : runnerUp;

    if (chosen < 0) break;
    order.push(chosen);
    visited[chosen] = true;
    current = chosen;
  }

  return order;
}

/**
 * Produit plusieurs tours candidats et renvoie le meilleur.
 *
 * Quand la tournee revient au depot, l'ordre est un cycle : un tour construit
 * depuis n'importe quel point peut etre tourne pour commencer au depot sans
 * rien changer a son cout. Un depart impose ne limite donc pas la
 * diversification. Quand elle ne revient pas, le premier point compte, et
 * seule la variante randomisee diversifie.
 */
export function buildInitialTour(
  matrix: DurationMatrix,
  startIndex: number,
  returnToStart: boolean,
  seed: number,
): number[] {
  const n = matrix.length;
  const random = createRandom(seed);

  const candidates: number[][] = [nearestNeighbour(matrix, startIndex)];

  if (returnToStart) {
    // Au-dela d'une centaine de points, essayer tous les departs couterait
    // plus que ce que la phase d'amelioration en tirerait.
    const starts = Math.min(n, 20);
    const stride = Math.max(1, Math.floor(n / starts));
    for (let s = 0; s < n; s += stride) {
      candidates.push(rotateToStart(nearestNeighbour(matrix, s), startIndex));
    }
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    candidates.push(nearestNeighbour(matrix, startIndex, random));
  }

  let best = candidates[0]!;
  let bestCost = tourCost(best, matrix, returnToStart);
  for (const candidate of candidates) {
    if (candidate.length !== n) continue;
    const cost = tourCost(candidate, matrix, returnToStart);
    if (cost < bestCost) {
      best = candidate;
      bestCost = cost;
    }
  }

  return [...best];
}

/** Fait tourner un cycle pour qu'il commence a `startIndex`. */
function rotateToStart(order: number[], startIndex: number): number[] {
  const position = order.indexOf(startIndex);
  if (position <= 0) return order;
  return [...order.slice(position), ...order.slice(0, position)];
}
