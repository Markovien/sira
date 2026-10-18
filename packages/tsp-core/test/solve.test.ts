import { describe, expect, it } from 'vitest';
import { solveTsp, tourCost, type DurationMatrix } from '../src/index.js';
import { euclideanMatrix, readInstance, readTour } from './tsplib.js';

/** Optimum exact par programmation dynamique (Held-Karp). Praticable jusqu a ~12 points. */
function exactOptimum(matrix: DurationMatrix, returnToStart: boolean): number {
  const n = matrix.length;
  const size = 1 << n;
  const dp = Array.from({ length: size }, () => new Array<number>(n).fill(Infinity));
  dp[1]![0] = 0;

  for (let mask = 1; mask < size; mask += 1) {
    for (let last = 0; last < n; last += 1) {
      const cost = dp[mask]![last]!;
      if (!Number.isFinite(cost) || !(mask & (1 << last))) continue;
      for (let next = 0; next < n; next += 1) {
        if (mask & (1 << next)) continue;
        const nextMask = mask | (1 << next);
        const candidate = cost + matrix[last]![next]!;
        if (candidate < dp[nextMask]![next]!) dp[nextMask]![next] = candidate;
      }
    }
  }

  const full = size - 1;
  let best = Infinity;
  for (let last = 0; last < n; last += 1) {
    const cost = dp[full]![last]!;
    if (!Number.isFinite(cost)) continue;
    best = Math.min(best, returnToStart ? cost + matrix[last]![0]! : cost);
  }
  return best;
}

function randomMatrix(n: number, seed: number): number[][] {
  let state = seed;
  const next = () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
  const points = Array.from({ length: n }, () => ({ x: next() * 100, y: next() * 100 }));
  return euclideanMatrix(points);
}

describe('solveTsp — validite', () => {
  it('visite chaque point exactement une fois', () => {
    const matrix = randomMatrix(12, 7);
    const { order } = solveTsp(matrix, { seed: 1 });
    expect(order).toHaveLength(12);
    expect(new Set(order).size).toBe(12);
  });

  it('commence par le point de depart impose', () => {
    const matrix = randomMatrix(10, 3);
    expect(solveTsp(matrix, { startIndex: 4 }).order[0]).toBe(4);
  });

  it('renvoie une duree egale au cout exact du tour rendu', () => {
    const matrix = randomMatrix(15, 11);
    const solution = solveTsp(matrix, { returnToStart: true });
    // La duree annoncee ne doit jamais venir d'un cumul de deltas.
    expect(solution.totalDurationSeconds).toBeCloseTo(
      tourCost(solution.order, matrix, true),
      6,
    );
  });

  it('refuse une matrice non carree', () => {
    expect(() => solveTsp([[0, 1], [1]])).toThrow(/non carree/);
  });

  it('refuse un point de depart hors matrice', () => {
    expect(() => solveTsp(randomMatrix(5, 1), { startIndex: 9 })).toThrow(/hors de la matrice/);
  });

  it('traite une liaison absente comme infranchissable, sans produire de NaN', () => {
    const matrix = [
      [0, 10, 5],
      [10, 0, Number.NaN],
      [5, 20, 0],
    ];
    const solution = solveTsp(matrix, { returnToStart: false });
    expect(Number.isNaN(solution.totalDurationSeconds)).toBe(false);
  });
});

describe('solveTsp — qualite', () => {
  it('atteint l optimum exact sur de petites instances', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const matrix = randomMatrix(9, seed);
      const optimum = exactOptimum(matrix, true);
      const solution = solveTsp(matrix, { returnToStart: true, seed });
      // A cette taille, 2-opt et Or-opt doivent retrouver l'optimum.
      expect(solution.totalDurationSeconds).toBeLessThanOrEqual(optimum * 1.0001);
    }
  });

  it('reste a moins de 8 % de l optimum sur berlin52', () => {
    const instance = readInstance('berlin52.tsp');
    const matrix = euclideanMatrix(instance.coordinates);
    expect(instance.coordinates).toHaveLength(52);

    // L'optimum est recalcule depuis le tour publie, jamais ecrit en dur.
    const optimalTour = readTour('berlin52.opt.tour');
    const optimum = tourCost(optimalTour, matrix, true);
    expect(optimum).toBe(7542);

    const solution = solveTsp(matrix, { returnToStart: true, timeLimitMs: 2000, seed: 42 });
    const gap = (solution.totalDurationSeconds - optimum) / optimum;

    // Le critere d'acceptation de la Phase 2 est 8 %. Le solveur atteint
    // l'optimum exact sur cette instance : asserter 8 % laisserait passer une
    // regression de 0 a 7 % sans rien signaler. La marge retenue couvre les
    // machines de CI plus lentes, qui font moins de redemarrages.
    expect(gap).toBeLessThanOrEqual(0.03);
    expect(new Set(solution.order).size).toBe(52);
  });

  it('ameliore nettement le tour glouton initial', () => {
    const matrix = randomMatrix(40, 17);
    const greedy = solveTsp(matrix, { timeLimitMs: 0, seed: 5 });
    const improved = solveTsp(matrix, { timeLimitMs: 800, seed: 5 });
    expect(improved.totalDurationSeconds).toBeLessThan(greedy.totalDurationSeconds);
    expect(improved.improvements).toBeGreaterThan(0);
  });
});

describe('solveTsp — budget de temps', () => {
  it('resout 50 arrets en moins d une seconde', () => {
    const matrix = randomMatrix(50, 23);
    const solution = solveTsp(matrix, { returnToStart: true, timeLimitMs: 800 });
    // Critere d'acceptation de la Phase 2.
    expect(solution.computeTimeMs).toBeLessThan(1000);
    expect(new Set(solution.order).size).toBe(50);
  });

  it('respecte un budget court', () => {
    const matrix = randomMatrix(80, 29);
    const solution = solveTsp(matrix, { returnToStart: true, timeLimitMs: 100 });
    // Marge pour la construction initiale, qui precede le budget.
    expect(solution.computeTimeMs).toBeLessThan(600);
  });

  it('donne le meme resultat a graine egale', () => {
    const matrix = randomMatrix(30, 31);
    const a = solveTsp(matrix, { seed: 99, timeLimitMs: 300 });
    const b = solveTsp(matrix, { seed: 99, timeLimitMs: 300 });
    expect(a.order).toEqual(b.order);
  });
});
