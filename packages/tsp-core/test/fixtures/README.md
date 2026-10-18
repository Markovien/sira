# Instances de référence

`berlin52` — 52 villes, instance classique de TSPLIB (Groetschel). Sert à
mesurer l'écart du solveur à l'optimum connu, critère d'acceptation de la
Phase 2 : **écart ≤ 8 %**.

| Fichier             | Contenu                                               |
| ------------------- | ----------------------------------------------------- |
| `berlin52.tsp`      | coordonnées des 52 villes, `EDGE_WEIGHT_TYPE: EUC_2D` |
| `berlin52.opt.tour` | tour optimal publié                                   |

La longueur optimale n'est **pas écrite en dur** dans les tests : elle est
recalculée à partir du tour optimal, avec la règle d'arrondi `EUC_2D` de
TSPLIB (distance euclidienne arrondie à l'entier le plus proche). Le test
vérifie au passage que ce calcul redonne bien 7542, la valeur publiée — si
l'un des deux fichiers était corrompu, l'écart se verrait immédiatement.

Les fichiers sont commités plutôt que téléchargés : la CI ne doit dépendre
d'aucun service externe, et ces deux fichiers pèsent moins de 2 Ko.
