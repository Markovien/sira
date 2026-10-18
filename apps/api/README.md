# @sira/api — Backend SIRA

NestJS + Prisma + PostgreSQL/PostGIS. Gère utilisateurs, organisations,
véhicules, missions, arrêts et la base d'adresses propriétaire.

## Démarrer

```bash
pnpm infra:up                               # PostgreSQL + PostGIS
pnpm --filter @sira/api prisma:deploy       # applique les migrations
pnpm --filter @sira/api dev                 # API sur http://localhost:3000
```

Documentation OpenAPI sur `/docs`, schéma brut sur `/docs-json`.
Sonde de santé sur `/health` : renvoie `degraded` si la base ne répond plus,
plutôt qu'une erreur — le service est debout, c'est une dépendance qui manque.

## Commandes

| Commande                                 | Effet                           |
| ---------------------------------------- | ------------------------------- |
| `pnpm --filter @sira/api dev`            | NestJS en mode watch            |
| `pnpm --filter @sira/api test`           | Vitest                          |
| `pnpm --filter @sira/api build`          | compile vers `dist/`            |
| `pnpm --filter @sira/api prisma:migrate` | crée une migration (interactif) |
| `pnpm --filter @sira/api prisma:deploy`  | applique les migrations         |
| `pnpm --filter @sira/api prisma:studio`  | explorateur de base             |

Le client Prisma est **généré, pas commité** : un `postinstall` s'en charge.

## Modèle de données

`Organization` est la racine : un livreur indépendant est simplement une
organisation d'une personne, pas un cas particulier du modèle. `User`
s'authentifie par **téléphone**, pas par e-mail — en Côte d'Ivoire le livreur a
un numéro mobile money, rarement une adresse e-mail.

`Stop` porte `informalDescription` : c'est le cœur du sujet, pas un champ
annexe. L'adresse utile à Abidjan est un repère (« en face de la station,
portail bleu à côté du maquis »), pas un numéro de rue.

`Address` est la base propriétaire — l'actif stratégique du cadrage §10.1.
Chaque livraison confirmée incrémente `confirmationCount` : plus le compteur
est élevé, plus la position est fiable.

### Migrations : à relire à la main

`prisma migrate dev` et `migrate diff` **ignorent les colonnes générées
`geog`** et leurs index GiST et trigram. Une migration générée sans relecture
propose de les supprimer, et de retirer le `DEFAULT` des colonnes générées —
ce qui les casserait.

Toute migration touchant `Stop`, `Depot` ou `Address` se relit et se corrige à
la main. Les colonnes sont déclarées en `Unsupported()` dans le schéma, ce qui
évite au moins leur suppression pure et simple, mais ne suffit pas pour les
index.

`test/schema-integrity.e2e.test.ts` échoue si la couche spatiale disparaît :
c'est le seul filet, aucun test fonctionnel ne verrait la différence — les
requêtes de proximité tomberaient simplement en balayage séquentiel.

### PostGIS

`Stop`, `Depot` et `Address` portent une colonne `geog` de type
`geography(Point, 4326)`, **générée** à partir de `lat`/`lon` par PostgreSQL
lui-même. Aucune désynchronisation possible, rien à maintenir côté
application. `lat`/`lon` restent la source de vérité : c'est ce que lisent le
mobile et le solveur TSP, qui n'ont pas de PostGIS.

Index GiST sur les trois colonnes, plus deux index trigram sur les libellés
d'`Address` — le repli du géocodage cherche soit le point connu le plus
proche, soit le libellé le plus ressemblant.

## Validation

Pas de `ValidationPipe` NestJS : il impose `class-validator` et des DTO à
décorateurs, soit un second système de validation à côté de Zod. On utilise
`ZodValidationPipe` avec les schémas de `@sira/shared`, partagés avec le mobile
et le dashboard — une règle métier s'écrit une fois et vaut partout.

```ts
@Post()
create(@Body(new ZodValidationPipe(createMissionSchema)) dto: CreateMission) {}
```

## Configuration

Validée au démarrage par Zod (`src/config/env.ts`) : une variable manquante
fait échouer le processus immédiatement, plutôt qu'une erreur 500 trois jours
plus tard. Variables attendues : voir [`.env.example`](../../.env.example).
