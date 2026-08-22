# SIRA

Optimisation de tournées de livraison urbaine en Côte d'Ivoire.
_Sira_ signifie « chemin » en dioula.

SIRA calcule le meilleur ordre de passage et le meilleur itinéraire pour les
livreurs urbains — TSP pour un livreur seul, VRP pour une flotte — et réajuste
la planification selon le trafic. Elle tourne sur des Android d'entrée de
gamme, fonctionne hors-ligne, et n'utilise aucune API cartographique payante.

- **Cadrage produit** → [`01-CADRAGE-PROJET.md`](01-CADRAGE-PROJET.md)
- **Feuille de route** → [`02-ROADMAP-DEV.md`](02-ROADMAP-DEV.md)
- **Contexte pour Claude Code** → [`CLAUDE.md`](CLAUDE.md)

## État

**Phase 0 — Fondations : terminée, à une vérification près.** Le monorepo, la
chaîne qualité, la CI GitHub Actions, l'environnement Docker et le jeu de
données Abidjan sont en place, et `pnpm lint`, `typecheck`, `test`,
`format:check` et `data:check` passent.

Reste un point avant d'ouvrir la Phase 1 : le smoke test d'infrastructure
(`pnpm infra:smoke`) n'a pas encore tourné en vert, faute d'un démon Docker et
d'un accès aux serveurs de données OSM là où la Phase 0 a été exécutée. Les
quatre commandes de la section « Environnement local » ci-dessous le mènent au
bout.

## Mise en route

### Prérequis

| Outil          | Version | Vérifier                                                             |
| -------------- | ------- | -------------------------------------------------------------------- |
| Node.js        | 22 LTS  | `node -v`                                                            |
| pnpm           | 9+      | `pnpm -v` — sinon `corepack enable pnpm`                             |
| Docker Desktop | récent  | `docker --version`                                                   |
| Python         | 3.12+   | `python --version` — pour le générateur de données et le solveur VRP |

### Installation

```bash
pnpm install
cp .env.example .env   # facultatif : tout a un défaut, à copier pour surcharger
```

### Environnement local

```bash
bash infra/osrm/prepare.sh      # extrait OSM Côte d'Ivoire + pipeline MLD (~15 min)
bash infra/photon/prepare.sh    # géocodeur Photon + index Côte d'Ivoire (~5 min)
pnpm infra:up
pnpm infra:smoke
```

`pnpm infra:smoke` valide les critères d'acceptation de la Phase 0 : PostGIS
répond, OSRM renvoie une route et une matrice de durées entre deux points
d'Abidjan, Photon géocode « Pharmacie Saint Jean Cocody ».

### Vérifications

```bash
pnpm format:check   # Prettier
pnpm lint           # ESLint
pnpm typecheck      # tsc --noEmit par paquet
pnpm test           # Vitest
pnpm data:check     # le JSON commité est bien la sortie du générateur
```

Ce sont exactement les vérifications rejouées par la CI
([`.github/workflows/ci.yml`](.github/workflows/ci.yml)).

## Structure

| Dossier               | Contenu                                             | Phase |
| --------------------- | --------------------------------------------------- | ----- |
| `apps/api`            | Backend NestJS + Prisma + PostGIS                   | 1     |
| `apps/mobile`         | Application livreur Expo, offline-first             | 3     |
| `apps/web`            | Dashboard flotte React + Vite                       | 4     |
| `packages/shared`     | Types, schémas Zod, helpers géographiques           | 0     |
| `packages/tsp-core`   | Solveur TSP TypeScript pur, embarquable             | 2     |
| `services/vrp-solver` | FastAPI + OR-Tools                                  | 2     |
| `services/traffic`    | Profils de vitesse et re-planification              | 5     |
| `infra`               | docker-compose, préparation OSRM/Photon, smoke test | 0     |
| `data`                | Jeu de données Abidjan + générateur + JSON Schema   | 0     |

## Principes

1. **Frugalité d'abord** — sobriété en données, batterie et coût serveur avant
   l'élégance technique.
2. **Aucune API payante** sans validation explicite : OSM, OSRM, Photon et
   OR-Tools, tous auto-hébergés.
3. **Hors-ligne par défaut** — l'application livreur fonctionne en mode avion
   et se synchronise ensuite.
4. **L'adressage informel est le sujet**, pas un cas particulier : repères,
   descriptions et photos plutôt que noms de rue.

## Licence

Propriétaire — tous droits réservés. Dépôt privé.
