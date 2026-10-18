import { at, tourCost } from './cost.js';
import type { DurationMatrix } from './types.js';

/**
 * Amelioration locale : 2-opt puis Or-opt, alternes jusqu'a epuisement du
 * budget de temps ou absence d'amelioration.
 *
 * Note sur l'asymetrie. 2-opt inverse un segment, ce qui ne change son cout
 * interne que si la matrice est symetrique. Les matrices OSRM ne le sont pas
 * tout a fait — sens uniques, tourne-a-gauche interdits. Le delta calcule ici
 * suppose la symetrie, mais **aucun tour n'est conserve sur la foi d'un
 * delta** : le cout exact est recalcule apres chaque mouvement accepte, et le
 * solveur ne renvoie jamais qu'un tour dont le cout exact est le meilleur
 * rencontre. A 100 points, ce recalcul coute 100 additions — negligeable, et
 * il supprime toute possibilite de derive.
 *
 * Or-opt, lui, deplace un segment sans l'inverser : son delta est exact meme
 * sur une matrice asymetrique.
 */

export interface ImproveResult {
  order: number[];
  cost: number;
  improvements: number;
}

/** Longueur maximale d'un segment deplace par Or-opt. */
const MAX_SEGMENT = 3;

export function improve(
  initial: readonly number[],
  matrix: DurationMatrix,
  returnToStart: boolean,
  deadline: number,
  now: () => number,
): ImproveResult {
  let current = [...initial];
  let currentCost = tourCost(current, matrix, returnToStart);
  let best = [...current];
  let bestCost = currentCost;
  let improvements = 0;

  let progressed = true;
  while (progressed && now() < deadline) {
    progressed = false;

    const afterTwoOpt = twoOptPass(current, matrix, returnToStart, deadline, now);
    if (afterTwoOpt.improved) {
      current = afterTwoOpt.order;
      currentCost = tourCost(current, matrix, returnToStart);
      improvements += afterTwoOpt.moves;
      progressed = true;
    }

    if (now() >= deadline) break;

    const afterOrOpt = orOptPass(current, matrix, returnToStart, deadline, now);
    if (afterOrOpt.improved) {
      current = afterOrOpt.order;
      currentCost = tourCost(current, matrix, returnToStart);
      improvements += afterOrOpt.moves;
      progressed = true;
    }

    // Le cout exact fait seul autorite : un mouvement juge ameliorant par un
    // delta approche ne peut pas degrader le resultat rendu.
    if (currentCost < bestCost) {
      bestCost = currentCost;
      best = [...current];
    }
  }

  return { order: best, cost: bestCost, improvements };
}

interface PassResult {
  order: number[];
  improved: boolean;
  moves: number;
}

/**
 * 2-opt : supprime deux aretes et reconnecte en inversant le segment
 * intermediaire. Defait les croisements, que le plus proche voisin produit en
 * abondance.
 */
function twoOptPass(
  order: readonly number[],
  matrix: DurationMatrix,
  returnToStart: boolean,
  deadline: number,
  now: () => number,
): PassResult {
  const tour = [...order];
  const n = tour.length;
  let moves = 0;

  // Le premier point est fixe : c'est le depot, ou le point de depart impose.
  const lastMovable = returnToStart ? n - 1 : n - 2;

  for (let i = 1; i < lastMovable; i += 1) {
    if (now() >= deadline) break;

    for (let j = i + 1; j <= lastMovable; j += 1) {
      const a = tour[i - 1]!;
      const b = tour[i]!;
      const c = tour[j]!;
      const d = tour[(j + 1) % n]!;

      // Sans retour au depot, l'arete de fermeture n'existe pas.
      if (!returnToStart && j === n - 1) {
        const delta = at(matrix, a, c) - at(matrix, a, b);
        if (delta < -1e-9) {
          reverse(tour, i, j);
          moves += 1;
        }
        continue;
      }

      const delta = at(matrix, a, c) + at(matrix, b, d) - at(matrix, a, b) - at(matrix, c, d);
      if (delta < -1e-9) {
        reverse(tour, i, j);
        moves += 1;
      }
    }
  }

  return { order: tour, improved: moves > 0, moves };
}

/**
 * Or-opt : deplace un segment de 1 a 3 points ailleurs dans le tour, sans
 * l'inverser. Complementaire du 2-opt, qui ne sait pas sortir un point isole
 * d'une mauvaise position.
 */
function orOptPass(
  order: readonly number[],
  matrix: DurationMatrix,
  returnToStart: boolean,
  deadline: number,
  now: () => number,
): PassResult {
  let tour = [...order];
  const n = tour.length;
  let moves = 0;

  for (let length = 1; length <= MAX_SEGMENT; length += 1) {
    for (let start = 1; start + length <= n; start += 1) {
      if (now() >= deadline) break;

      const segment = tour.slice(start, start + length);
      const without = [...tour.slice(0, start), ...tour.slice(start + length)];
      const baseCost = tourCost(tour, matrix, returnToStart);

      let bestInsert = -1;
      let bestCost = baseCost;

      for (let position = 1; position <= without.length; position += 1) {
        if (position === start) continue;
        const candidate = [
          ...without.slice(0, position),
          ...segment,
          ...without.slice(position),
        ];
        const cost = tourCost(candidate, matrix, returnToStart);
        if (cost < bestCost - 1e-9) {
          bestCost = cost;
          bestInsert = position;
        }
      }

      if (bestInsert >= 0) {
        tour = [...without.slice(0, bestInsert), ...segment, ...without.slice(bestInsert)];
        moves += 1;
      }
    }
  }

  return { order: tour, improved: moves > 0, moves };
}

/**
 * Perturbation « double pont » : coupe le tour en quatre et recolle les
 * morceaux dans un autre ordre. C'est le mouvement classique des recherches
 * locales iterees, parce que 2-opt ne sait pas le defaire — une simple
 * inversion de segment le reconstituerait aussitot, et la recherche
 * retomberait dans le meme optimum local.
 *
 * Le premier point reste en place : c'est le depot.
 */
export function doubleBridge(order: readonly number[], random: () => number): number[] {
  const n = order.length;
  // En deca de huit points, les trois coupures n'ont pas la place d'exister.
  if (n < 8) return [...order];

  const cuts = [0, 0, 0].map(() => 1 + Math.floor(random() * (n - 1))).sort((a, b) => a - b);
  const [p1, p2, p3] = cuts as [number, number, number];
  if (p1 === p2 || p2 === p3) return [...order];

  return [
    ...order.slice(0, p1),
    ...order.slice(p2, p3),
    ...order.slice(p1, p2),
    ...order.slice(p3),
  ];
}

function reverse(tour: number[], from: number, to: number): void {
  let left = from;
  let right = to;
  while (left < right) {
    const temp = tour[left]!;
    tour[left] = tour[right]!;
    tour[right] = temp;
    left += 1;
    right -= 1;
  }
}
