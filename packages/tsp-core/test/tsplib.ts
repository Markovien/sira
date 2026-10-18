import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Lecture minimale du format TSPLIB, limitee a ce dont les tests ont besoin :
 * instances EUC_2D et fichiers de tour.
 */

export interface TsplibInstance {
  name: string;
  coordinates: { x: number; y: number }[];
}

const fixture = (file: string) =>
  readFileSync(fileURLToPath(new URL(`./fixtures/${file}`, import.meta.url)), 'utf8');

export function readInstance(file: string): TsplibInstance {
  const lines = fixture(file).split(/\r?\n/);
  const coordinates: { x: number; y: number }[] = [];
  let name = '';
  let inCoords = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith('NAME')) name = line.split(':')[1]?.trim() ?? '';
    if (line === 'NODE_COORD_SECTION') {
      inCoords = true;
      continue;
    }
    if (line === 'EOF' || line === '') continue;
    if (!inCoords) continue;

    const [, x, y] = line.split(/\s+/);
    if (x === undefined || y === undefined) continue;
    coordinates.push({ x: Number(x), y: Number(y) });
  }

  return { name, coordinates };
}

/** Indices a partir de 0, la ou TSPLIB numerote a partir de 1. */
export function readTour(file: string): number[] {
  const lines = fixture(file).split(/\r?\n/);
  const tour: number[] = [];
  let inTour = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (line === 'TOUR_SECTION') {
      inTour = true;
      continue;
    }
    if (!inTour || line === '' || line === 'EOF') continue;
    for (const token of line.split(/\s+/)) {
      const value = Number(token);
      if (value === -1) return tour;
      if (Number.isFinite(value)) tour.push(value - 1);
    }
  }

  return tour;
}

/**
 * Matrice de distances selon la regle EUC_2D de TSPLIB : distance euclidienne
 * arrondie a l'entier le plus proche. L'arrondi fait partie de la definition
 * de l'instance — sans lui, l'optimum publie n'est pas comparable.
 */
export function euclideanMatrix(coordinates: { x: number; y: number }[]): number[][] {
  const n = coordinates.length;
  const matrix: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));

  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      if (i === j) continue;
      const a = coordinates[i]!;
      const b = coordinates[j]!;
      matrix[i]![j] = Math.round(Math.hypot(a.x - b.x, a.y - b.y));
    }
  }

  return matrix;
}
