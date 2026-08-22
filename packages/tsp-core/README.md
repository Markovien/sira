# @sira/tsp-core

Solveur TSP en TypeScript pur, partagé entre le mobile (optimisation
embarquée) et l'API (mission à un seul véhicule).

## État

**Phase 0 : contrat d'interface seulement.** `src/index.ts` déclare les types
d'entrée et de sortie ; l'implémentation arrive en **Phase 2** :

1. construction du tour — plus proche voisin multi-départs ;
2. amélioration — 2-opt et Or-opt sous budget de temps (défaut 800 ms) ;
3. benchmark reproductible `pnpm bench` sur instances TSPLIB.

## Règle d'or

Zéro dépendance native, zéro API spécifique à Node : ce paquet doit s'exécuter
tel quel dans Hermes, le moteur JavaScript de React Native. Toute PR
introduisant une dépendance ici doit être justifiée explicitement.

## Objectifs de performance (critères d'acceptation Phase 2)

| Mesure | Cible |
|---|---|
| Écart à l'optimum connu (TSPLIB `berlin52`) | ≤ 8 % |
| 50 arrêts sur Node | < 1 s |
| 30 arrêts sur Android d'entrée de gamme | < 1 s |
