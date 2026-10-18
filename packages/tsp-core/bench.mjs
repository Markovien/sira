/**
 * Benchmark reproductible du solveur TSP (roadmap Phase 2.4).
 *
 *   pnpm --filter @sira/tsp-core bench
 *
 * Tourne sur la sortie compilee et non sur les sources : c'est ce que
 * consomment reellement l'API et, demain, le mobile.
 *
 * Deux familles d'instances :
 *  - berlin52, dont l'optimum est connu, pour mesurer l'ecart ;
 *  - le jeu de donnees Abidjan, pour les tailles et durees du pilote.
 *
 * Graines fixees : deux executions rendent les memes couts, seuls les temps
 * varient d'une machine a l'autre.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { solveTsp, tourCost } from './dist/esm/index.js';

const FALLBACK_SPEED_KMH = 22;
const DETOUR_FACTOR = 1.35;
const EARTH_RADIUS_M = 6_371_008.8;

const read = (relative) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

function haversine(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat));
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Matrice de repli hors-ligne : vol d'oiseau x detour urbain / vitesse. */
function abidjanMatrix(points) {
  const metersPerSecond = (FALLBACK_SPEED_KMH * 1000) / 3600;
  return points.map((from) =>
    points.map((to) =>
      from === to ? 0 : (haversine(from, to) * DETOUR_FACTOR) / metersPerSecond,
    ),
  );
}

function parseSection(text, header) {
  const values = [];
  let inside = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === header) {
      inside = true;
      continue;
    }
    if (!inside || line === '' || line === 'EOF') continue;
    values.push(line.split(/\s+/));
  }
  return values;
}

function readBerlin() {
  const coords = parseSection(read('./test/fixtures/berlin52.tsp'), 'NODE_COORD_SECTION')
    .filter((parts) => parts.length >= 3)
    .map(([, x, y]) => ({ x: Number(x), y: Number(y) }));

  const matrix = coords.map((a) =>
    coords.map((b) => Math.round(Math.hypot(a.x - b.x, a.y - b.y))),
  );

  const tour = [];
  for (const parts of parseSection(read('./test/fixtures/berlin52.opt.tour'), 'TOUR_SECTION')) {
    for (const token of parts) {
      const value = Number(token);
      if (value === -1) break;
      if (Number.isFinite(value)) tour.push(value - 1);
    }
  }

  return { matrix, optimum: tourCost(tour, matrix, true) };
}

function run(label, matrix, timeLimitMs, optimum) {
  const solution = solveTsp(matrix, { returnToStart: true, timeLimitMs, seed: 42 });
  const gap =
    optimum === undefined
      ? ''
      : `${(((solution.totalDurationSeconds - optimum) / optimum) * 100).toFixed(2)} %`;

  console.log(
    label.padEnd(24) +
      String(matrix.length).padStart(4) +
      String(Math.round(solution.totalDurationSeconds)).padStart(10) +
      gap.padStart(9) +
      `${solution.computeTimeMs} ms`.padStart(10) +
      String(solution.improvements).padStart(8),
  );
}

console.log('\nBenchmark @sira/tsp-core — graine 42, retour au depot\n');
console.log(
  'instance'.padEnd(24) +
    'n'.padStart(4) +
    'cout'.padStart(10) +
    'ecart'.padStart(9) +
    'temps'.padStart(10) +
    'ameli.'.padStart(8),
);
console.log('-'.repeat(65));

const berlin = readBerlin();
for (const budget of [100, 800, 3000]) {
  run(`berlin52 (${budget} ms)`, berlin.matrix, budget, berlin.optimum);
}

const dataset = JSON.parse(read('../../data/abidjan-stops.json'));
for (const n of [15, 30, 50, 60]) {
  run(`abidjan ${n} arrets`, abidjanMatrix(dataset.stops.slice(0, n)), 800);
}

console.log('\nCouts deterministes a graine fixee ; seuls les temps varient.\n');
