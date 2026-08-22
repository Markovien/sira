# CLAUDE.md — SIRA

Contexte permanent pour les sessions Claude Code sur ce dépôt.
À relire en début de session ; à mettre à jour en fin de chaque phase.

## Le projet en trois phrases

SIRA optimise les tournées de livraison urbaine en Côte d'Ivoire : à partir des
arrêts du jour, elle calcule le meilleur ordre de passage (TSP pour un livreur
seul, VRP pour une flotte) et réajuste selon le trafic. Elle vise des
smartphones Android d'entrée de gamme, fonctionne hors-ligne, et n'utilise
aucune API cartographique payante. Le pilote cible Abidjan.

Documents de référence, à lire avant toute décision structurante :

- [`01-CADRAGE-PROJET.md`](01-CADRAGE-PROJET.md) — vision, business model, risques.
- [`02-ROADMAP-DEV.md`](02-ROADMAP-DEV.md) — les 8 phases et leurs critères d'acceptation.

## Règles non négociables

1. **Frugalité d'abord.** Devant un choix d'implémentation ambigu, prendre
   systématiquement l'option la plus sobre en données, batterie et coût
   serveur — même si elle est moins élégante.
2. **Aucune API payante** sans validation explicite du fondateur. Pas de Google
   Maps API, pas de service de trafic sous licence, pas d'outil SaaS facturé.
   Les alternatives retenues sont OSM, OSRM, Photon et OR-Tools, auto-hébergés.
3. **Le mobile doit tourner hors-ligne.** Tout ce qui est indispensable au
   livreur (carte, ordre de passage, saisie, preuve de livraison) fonctionne en
   mode avion et se synchronise ensuite.
4. **`packages/tsp-core` reste du TypeScript pur** — zéro dépendance native,
   zéro API Node : il s'exécute dans Hermes (React Native).
5. **Pas de secrets en dur.** `.env` local, `.env.example` tenu à jour, jamais
   de valeur réelle commitée.
6. **Ordre des phases.** Ne pas commencer une phase tant que les critères
   d'acceptation de la précédente ne sont pas tous verts.

## Commandes

### Quotidien

```bash
pnpm install            # installe tout le monorepo
pnpm dev                # lance les applications en développement (turbo)
pnpm test               # tests unitaires (Vitest) sur tous les paquets
pnpm lint               # ESLint sur tout le dépôt
pnpm typecheck          # tsc --noEmit par paquet
pnpm format             # Prettier en écriture (format:check en lecture seule)
pnpm data:validate      # valide data/abidjan-stops.json contre le schéma Zod
```

### Infrastructure locale

```bash
bash infra/osrm/prepare.sh      # une fois : extrait OSM CI + pipeline MLD (~15 min, ~2 Go)
bash infra/photon/prepare.sh    # une fois : jar Photon + index de géocodage CI (~5 min, ~1 Go)
pnpm infra:up                   # démarre postgres+postgis, osrm, photon
pnpm infra:smoke                # vérifie les critères d'acceptation de la Phase 0
pnpm infra:logs                 # suit les logs des conteneurs
pnpm infra:down                 # arrête tout
```

### Données de test

```bash
python data/generate-abidjan-stops.py   # régénère data/abidjan-stops.json
```

Le JSON commité doit être exactement la sortie du générateur — la CI le
vérifie. Ne jamais retoucher le JSON à la main : modifier le script Python.

## Architecture

```
sira/
├── apps/
│   ├── api/          # NestJS + Prisma + PostgreSQL/PostGIS     (Phase 1)
│   ├── mobile/       # Expo / React Native, offline-first       (Phase 3)
│   └── web/          # React + Vite, dashboard flotte           (Phase 4)
├── services/
│   ├── vrp-solver/   # Python FastAPI + OR-Tools                (Phase 2)
│   └── traffic/      # Profils de vitesse, re-planification     (Phase 5)
├── packages/
│   ├── tsp-core/     # Solveur TSP TypeScript pur               (Phase 2)
│   ├── shared/       # Types, schémas Zod, géo — écrit en Phase 0
│   └── ui/           # Composants web partagés                  (Phase 4)
├── infra/            # docker-compose, préparation OSRM/Photon, smoke test
└── data/             # jeu de données Abidjan + générateur + JSON Schema
```

`@sira/shared` est la source de vérité du vocabulaire métier : statuts d'arrêt,
rôles, types de véhicule, schémas Zod, helpers géographiques. Toute nouvelle
notion partagée entre deux applications y va, pas ailleurs.

### Choix d'architecture déjà arrêtés

| Décision | Motif |
|---|---|
| OSRM en pipeline **MLD**, pas CH | Seul MLD permet de réinjecter les vitesses trafic (Phase 5) via un simple `osrm-customize`, sans retraiter l'extrait |
| Photon lancé depuis le **jar officiel** sur `eclipse-temurin`, index pré-construit GraphHopper | Évite une image Docker communautaire non auditée et un import Nominatim de plusieurs heures |
| Extrait Geofabrik nommé **`ivory-coast-latest.osm.pbf`** | C'est le slug réel de Geofabrik ; la roadmap mentionne `cote-divoire` par commodité |
| Navigation **déléguée par deep link** à l'app GPS du téléphone | Zéro coût d'API de navigation, zéro guidage vocal à maintenir |
| Coordonnées : toujours `{ lat, lon }` en interne | OSRM attend `lon,lat` — passer **obligatoirement** par `toOsrmCoordinate()` de `@sira/shared`, l'inversion est le bug classique |
| `node-linker=hoisted` dans `.npmrc` | Expo et les bindings natifs supportent mal les liens symboliques de pnpm |

## Conventions

- **TypeScript strict** partout (`tsconfig.base.json`), y compris
  `noUncheckedIndexedAccess` et `exactOptionalPropertyTypes`. Python uniquement
  pour `services/vrp-solver` et `services/traffic`.
- **Commits conventionnels** : `feat:`, `fix:`, `chore:`, `docs:`, `test:`,
  `refactor:`. Une branche par phase — `phase-0-fondations`,
  `phase-1-backend-core`, etc.
- **Langue** : code, identifiants et types en anglais ; commentaires,
  documentation et interface utilisateur en français. Les commentaires
  expliquent *pourquoi*, pas *quoi*.
- **Tests** : Vitest pour TypeScript, pytest pour Python. Couverture visée
  ≥ 70 % sur les services de `apps/api` (critère d'acceptation Phase 1).
- **Accents** : le code source et les scripts shell restent en ASCII pour
  éviter les problèmes d'encodage entre Windows et Linux ; les fichiers
  Markdown et les chaînes destinées à l'utilisateur sont accentués normalement.

## Où en est le projet

| Phase | État | Livrable |
|---|---|---|
| 0 — Fondations | **Terminée** (vérification infra en attente de Docker) | Monorepo, CI, docker-compose, dataset Abidjan |
| 1 — Backend cœur | À faire | API missions complète |
| 2 — Optimisation | À faire | TSP + VRP benchmarkés |
| 3 — Mobile TSP | À faire | MVP livreur hors-ligne |
| 4 — Web VRP | À faire | MVP flotte démontrable |
| 5 — Trafic | À faire | Re-planification dynamique |
| 6 — Freemium | À faire | Paiement mobile money |
| 7 — Durcissement | À faire | Lancement pilote Abidjan |

### Dette et points ouverts

- **Node.js et Docker ne sont pas installés sur la machine de développement.**
  Tant que ce n'est pas fait, `pnpm install`, `pnpm test` et `pnpm infra:up`
  n'ont jamais été exécutés localement : le lockfile `pnpm-lock.yaml` n'existe
  pas et les critères d'acceptation d'infrastructure de la Phase 0 restent à
  vérifier. Voir « Mise en route » dans le [README](README.md).
- Versions à confirmer au premier lancement réel : tag de l'image
  `osrm/osrm-backend`, `PHOTON_VERSION` et l'URL de l'index GraphHopper
  (variables surchargées en tête des scripts `infra/*/prepare.sh`).
- Le nom « SIRA » est provisoire (cadrage) et le dépôt de marque OAPI reste à
  faire (cadrage §10.5).
