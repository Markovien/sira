# services/vrp-solver — Solveur VRP (FastAPI + OR-Tools)

**Créé en Phase 2** de la roadmap. Seul composant Python du produit, hors du
workspace pnpm (géré par son propre `pyproject.toml`).

Endpoint prévu — `POST /solve` : matrice de durées, K véhicules, capacités,
fenêtres horaires, dépôts, durée de service par arrêt. Stratégie
`PATH_CHEAPEST_ARC` puis `GUIDED_LOCAL_SEARCH`, limite de temps paramétrable
(défaut 10 s).

Tests de référence : instances Solomon C101 et R101 — solution faisable, coût
dans les 15 % des meilleures références connues.
