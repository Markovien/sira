// Marque les deux sorties d'un paquet double ESM/CJS.
//
// tsc n'ecrit pas de package.json dans ses dossiers de sortie. Sans ces
// marqueurs, Node interprete dist/cjs/*.js selon le "type" du paquet parent —
// "module" ici — et refuse le require(). Deux fichiers de trois lignes suffisent
// a lever l'ambiguite, la ou renommer en .mjs/.cjs demanderait de reecrire
// toutes les extensions d'import.
//
// Usage : node ../../scripts/finalize-dual-build.mjs   (depuis le paquet)

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const targets = [
  ['dist/esm', 'module'],
  ['dist/cjs', 'commonjs'],
];

for (const [dir, type] of targets) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ type }, null, 2)}\n`, 'utf8');
}

console.log('dist/esm et dist/cjs marques');
