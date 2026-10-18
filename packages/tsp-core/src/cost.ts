import type { DurationMatrix } from './types.js';

/**
 * Cout exact d'un tour, recalcule depuis la matrice.
 *
 * Les heuristiques raisonnent sur des deltas ; cette fonction est la seule
 * source de verite du cout reel. Le solveur ne conserve jamais un tour sur la
 * foi d'un delta sans l'avoir repasse ici.
 */
export function tourCost(
  order: readonly number[],
  matrix: DurationMatrix,
  returnToStart: boolean,
): number {
  let total = 0;
  for (let i = 0; i < order.length - 1; i += 1) {
    total += at(matrix, order[i]!, order[i + 1]!);
  }
  if (returnToStart && order.length > 1) {
    total += at(matrix, order[order.length - 1]!, order[0]!);
  }
  return total;
}

/**
 * Acces a la matrice. Les matrices OSRM arrivent parfois avec des trous
 * (`null` quand aucune route n'existe) : les traiter comme infinis evite
 * qu'un NaN se propage silencieusement dans tous les couts.
 */
export function at(matrix: DurationMatrix, from: number, to: number): number {
  const value = matrix[from]?.[to];
  return value == null || Number.isNaN(value) ? Number.POSITIVE_INFINITY : value;
}

/** Verifie qu'une matrice est carree et exploitable avant de s'en servir. */
export function assertSquareMatrix(matrix: DurationMatrix): void {
  const n = matrix.length;
  if (n < 2) {
    throw new Error('La matrice doit contenir au moins deux points');
  }
  for (let i = 0; i < n; i += 1) {
    if (matrix[i]?.length !== n) {
      throw new Error(
        `Matrice non carree : ligne ${i} de taille ${matrix[i]?.length ?? 0}, ${n} attendu`,
      );
    }
  }
}
