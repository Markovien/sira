# @sira/tsp-core

Solveur TSP embarquable : à partir d'une matrice de durées, il calcule l'ordre
de visite qui minimise le temps de tournée.

**Contrainte non négociable** — TypeScript pur, zéro dépendance native, aucune
API Node. Ce code tourne dans Hermes, sur un Android d'entrée de gamme.

## Usage

```ts
import { solveTsp } from '@sira/tsp-core';

const solution = solveTsp(matriceDesDurees, {
  startIndex: 0, // le dépôt
  returnToStart: true, // false pour un livreur qui rentre chez lui
  timeLimitMs: 800,
  seed: 42, // résultats reproductibles
});
// → { order, totalDurationSeconds, computeTimeMs, improvements }
```

## Comment il procède

**Construction** — plus proche voisin, multi-départs. Le glouton seul produit
un tour médiocre et très dépendant du point de départ ; en varier le départ et
garder le meilleur coûte peu et donne à la suite un bien meilleur point de
départ.

**Descente locale** — 2-opt (défait les croisements) puis Or-opt (déplace un
segment de 1 à 3 arrêts ailleurs, sans l'inverser), alternés jusqu'à
épuisement.

**Redémarrages perturbés** — la descente s'arrête au premier optimum local,
souvent en quelques millisecondes : sur une tournée de dix arrêts, le budget
resterait inutilisé. Une perturbation « double pont » relance la descente
depuis un point que 2-opt ne sait pas défaire. Seul un tour strictement
meilleur remplace le précédent, donc perturber ne peut jamais dégrader le
résultat.

### Matrices asymétriques

2-opt inverse un segment, ce qui ne laisse son coût interne inchangé que si la
matrice est symétrique. Les matrices OSRM ne le sont pas tout à fait — sens
uniques, tourne-à-gauche interdits.

Le delta calculé suppose la symétrie, mais **aucun tour n'est conservé sur la
foi d'un delta** : le coût exact est recalculé depuis la matrice après chaque
mouvement accepté, et le solveur ne renvoie que le meilleur tour au coût
exact. À 100 points ce recalcul coûte 100 additions. Or-opt, lui, ne renverse
rien : son delta est exact même en asymétrique.

Une liaison absente (`null` ou `NaN` dans la matrice, quand OSRM ne trouve pas
de route) est traitée comme infranchissable plutôt que propagée en `NaN`.

## Benchmark

```bash
pnpm --filter @sira/tsp-core bench
```

Tourne sur la **sortie compilée**, pas sur les sources : c'est ce que
consomment l'API et le mobile. Graines fixées, donc coûts reproductibles à
l'identique ; seuls les temps varient d'une machine à l'autre.

Relevé sur un conteneur de développement (Node 22) :

| Instance          | n   | Coût     | Écart à l'optimum | Budget  |
| ----------------- | --- | -------- | ----------------- | ------- |
| berlin52          | 52  | 7885     | 4,55 %            | 100 ms  |
| berlin52          | 52  | **7542** | **0,00 %**        | 800 ms  |
| berlin52          | 52  | 7542     | 0,00 %            | 3000 ms |
| abidjan 15 arrêts | 15  | 3190 s   | —                 | 800 ms  |
| abidjan 30 arrêts | 30  | 8498 s   | —                 | 800 ms  |
| abidjan 50 arrêts | 50  | 12874 s  | —                 | 800 ms  |
| abidjan 60 arrêts | 60  | 15284 s  | —                 | 800 ms  |

Le critère d'acceptation de la Phase 2 est un écart ≤ 8 % sur berlin52 et
50 arrêts résolus en moins d'une seconde. Les deux sont tenus avec une marge
confortable — l'optimum exact est atteint dès 800 ms.

Les instances Abidjan utilisent la matrice de repli hors-ligne (vol d'oiseau ×
facteur de détour urbain ÷ vitesse moyenne), pas OSRM : ce sont des ordres de
grandeur de tournée, pas des durées de référence.

## Tests

```bash
pnpm --filter @sira/tsp-core test
```

La qualité est vérifiée de deux façons complémentaires. Sur de petites
instances (9 points), l'optimum **exact** est calculé par programmation
dynamique (Held-Karp) et le solveur doit l'atteindre. Sur berlin52, l'optimum
publié est **recalculé depuis le tour optimal** plutôt qu'écrit en dur — si
l'un des deux fichiers était corrompu, l'écart se verrait aussitôt.
