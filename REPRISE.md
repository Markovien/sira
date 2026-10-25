# Où reprendre

État de la session de développement, tenu à jour à chaque lot livré.
Ce document répond à une seule question : **que faire maintenant, et comment
remonter l'environnement pour le faire ?**

- Le _quoi_ et le _comment_ permanents sont dans [`CLAUDE.md`](CLAUDE.md).
- Le _pourquoi_ de chaque choix est dans [`decisions.md`](decisions.md).

---

## En un coup d'œil

|                    |                                                                                 |
| ------------------ | ------------------------------------------------------------------------------- |
| **Branche**        | `claude/phase-0-execution-iyvf4a`                                               |
| **Dépôt**          | `Markovien/sira` — pas de pull request ouverte, tout est sur la branche         |
| **Phase courante** | **3 en cours** — lots 1 à 3 livrés ; le 4 (exécution de tournée) est le suivant |
| **Bloqué sur**     | rien côté code — deux points attendent le fondateur (voir plus bas)             |

| Phase              | État                                                                |
| ------------------ | ------------------------------------------------------------------- |
| 0 — Fondations     | Complète **sauf** le smoke test infra, bloqué par le réseau         |
| 1 — Backend cœur   | ✅ 16 routes, couverture 94 %                                       |
| 2 — Optimisation   | ✅ TSP 0 % d'écart sur berlin52, VRP 0,01 % sur C101, orchestration |
| **3 — Mobile TSP** | **en cours** : lots 1 à 3 sur 6 livrés                              |
| 4 à 7              | à faire                                                             |

**239 tests**, tous verts : 51 dans `@sira/shared`, 12 dans `tsp-core`, 93
côté API (31 unitaires et 62 de bout en bout), 16 sur le solveur VRP, 67 sur
la logique mobile.
Couverture 94 % sur les services de l'API, seuil de 70 % appliqué en CI.

Compter avec `git log --oneline origin/main..HEAD` plutôt que de se fier à ce
tableau s'il paraît daté.

---

## Ce qui existe déjà

À lire avant d'écrire quoi que ce soit : la moitié de ce qu'on croit devoir
construire est déjà là.

| Emplacement                | Contenu                                                                                                                                |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api`                 | NestJS + Prisma. 16 routes : auth, missions, arrêts, import CSV/XLSX, routage, géocodage, optimisation.                                |
| `packages/shared`          | Vocabulaire métier et **tous les schémas Zod** — auth, missions, arrêts, géocodage, optimisation. Partagés avec le mobile et le web.   |
| `packages/tsp-core`        | Solveur TSP pur TypeScript, validé sur berlin52. Build double ESM/CJS en place.                                                        |
| `apps/mobile`              | Expo SDK 58 + expo-router. `src/core` (TS pur, testé en Node) : optimisation embarquée, liens « Y aller ». Thème contrasté, textes FR. |
| `services/vrp-solver`      | FastAPI + OR-Tools. `POST /solve`. Dockerfile et travail CI inclus.                                                                    |
| `infra`                    | docker-compose (PostGIS, OSRM, Photon, VRP), scripts de préparation, smoke test, vérification du pipeline OSRM.                        |
| `data`                     | 60 arrêts d'Abidjan, générateur déterministe, JSON Schema.                                                                             |
| `.github/workflows/ci.yml` | 6 travaux : qualité, données, scripts, solveur VRP, API compilée, bundle mobile Android (< 8 Mo).                                      |

Trois conventions qui évitent de refaire le travail :

- **Toute règle de validation vit dans `@sira/shared`**, jamais réécrite côté
  client. Le format d'un numéro ivoirien s'y trouve déjà.
- **Toute méthode de service prend `organizationId` en premier argument
  obligatoire** — c'est ainsi que le cloisonnement tient.
- **Toute décision structurante va dans `decisions.md` avant d'être codée.**

---

## Remonter l'environnement de développement

**À faire en premier après tout redémarrage de conteneur.** Le démon Docker et
les services ne survivent pas ; les perdre sans le savoir fait échouer les
tests de bout en bout pour de mauvaises raisons.

```bash
# 1. Démon Docker (absent au démarrage, le binaire est là)
nohup dockerd > /tmp/dockerd.log 2>&1 & disown
until docker info >/dev/null 2>&1; do sleep 1; done

# 2. PostgreSQL + PostGIS
bash infra/compose.sh up -d postgres
until docker exec sira-postgres pg_isready -U sira -d sira >/dev/null 2>&1; do sleep 1; done
pnpm --filter @sira/api exec prisma migrate deploy

# 3. OSRM sur l'extrait synthétique, persistant — requis par les tests
#    d'orchestration. Idempotent ; `--stop` pour arrêter et nettoyer.
bash infra/osrm/run-synthetic.sh

# 4. Solveur VRP
cd services/vrp-solver && pip install -e ".[dev]"
nohup python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 >/tmp/vrp.log 2>&1 & disown

# 5. Photon sur l'index reel (facultatif : la recherche d'adresse en depend,
#    pas les tests). Une fois : bash infra/photon/prepare.sh (~1 min).
bash infra/compose.sh up -d photon
```

Cinq nœuds autour d'Abidjan suffisent à exercer le code ; ils ne valident pas
la qualité du routage — c'est le rôle du smoke test de la Phase 0, sur
l'extrait réel. `infra/osrm/verify-pipeline.sh` valide la chaîne puis se
nettoie ; `run-synthetic.sh` laisse le service debout.

Ne pas publier OSRM sur **5060 ni 5061** : la spécification `fetch` bloque ces
ports (SIP) et undici les refuse sans message clair. J'y ai perdu du temps.

Variables attendues par les tests de bout en bout :

```bash
export DATABASE_URL="postgresql://sira:sira@localhost:5432/sira?schema=public"
# 16 caractères minimum, le schéma de configuration le vérifie au démarrage.
export JWT_ACCESS_SECRET="secret-de-test-local-sans-valeur"
export JWT_REFRESH_SECRET="autre-secret-de-test-local"
export OSRM_URL="http://127.0.0.1:5000" VRP_SOLVER_URL="http://127.0.0.1:8000"
```

`127.0.0.1` et non `localhost` : undici n'a pas de repli IPv4.

---

## Vérifier avant de pousser

**Depuis un arbre nettoyé**, sans quoi un `dist` résiduel fait passer en local
ce qui échoue en CI :

```bash
rm -rf packages/*/dist apps/api/dist apps/api/coverage .turbo
pnpm build && pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm data:check
pnpm --filter @sira/api test:cov      # unitaires + e2e, seuil 70 % sur les services
bash apps/api/scripts/smoke.sh        # l'API compilée démarre et répond
cd services/vrp-solver && pytest -q && ruff check . && ruff format --check .
```

Deux pièges déjà rencontrés, qui ne se voient que là :

- le **typecheck** attrape ce que lint et tests laissent passer (signatures) ;
- un test **ignoré** ressemble à un test réussi — vérifier qu'aucun `↓`
  n'apparaît dans le rapport.

---

## Pièges à connaître

- **Migrations Prisma** : `migrate dev` et `migrate diff` ignorent les colonnes
  générées `geog` et leurs index GiST/trigram, et proposent de les supprimer.
  Toute migration touchant `Stop`, `Depot` ou `Address` se relit à la main.
  `test/schema-integrity.e2e.test.ts` est le filet.
- **Ports 5060 et 5061** : bloqués par la spécification `fetch` (SIP), undici
  les refuse sans message clair.
- **`dist` résiduel** : fait passer en local ce qui échoue en CI, ESLint étant
  _type-aware_. D'où le nettoyage avant vérification.
- **Un test ignoré ressemble à un test réussi** : vérifier qu'aucun `↓`
  n'apparaît dans le rapport.

## Prochaine étape : Phase 3, lot 4

La Phase 3 est découpée en lots, chacun livré vert et poussé :

| Lot | Contenu                                                                                         | État        |
| --- | ----------------------------------------------------------------------------------------------- | ----------- |
| 1   | Squelette Expo, thème, i18n ; matrice hors-ligne (`@sira/shared`) ; `planRoute` ; deep links    | ✅ livré    |
| 2   | Connexion (expo-secure-store), client API typé par les schémas Zod, liste et détail missions    | ✅ livré    |
| 3   | SQLite locale, file de synchronisation, création de mission hors-ligne, matrices OSRM via l'API | ✅ livré    |
| 4   | Exécution de tournée : statuts, preuve (photo compressée, signature), re-calcul en un tap       | **suivant** |
| 5   | Carte MapLibre hors-ligne (PMTiles) — dépend d'un extrait OSM, donc du réseau                   | à faire     |
| 6   | Sobriété (GPS 30 s), Maestro sur 3 parcours, build Android                                      | à faire     |

Pour le lot 4, deux points à trancher dans `decisions.md` avant de coder :

- **l'heure d'une livraison** : rejouée des heures plus tard, une mise à jour
  de statut reçoit aujourd'hui `completedAt = now()` côté serveur. Il faut
  transmettre l'heure du téléphone (chaque entrée de file porte déjà son `createdAt`),
  et décider de la règle en cas de conflit avec une modification serveur ;
- **la preuve de livraison** : stockage des photos (où, quelle taille, quelle
  compression) — c'est la première donnée lourde du projet.

Ce qui est en place et à réutiliser :

- **`planRoute`** (`apps/mobile/src/core/optimize.ts`) sert au calcul initial
  _et_ au re-calcul de l'ordre restant : position courante + arrêts restants.
  Sans matrices OSRM, il bascule sur `fallbackMatrices` de `@sira/shared`.
- **`navigationLinks` + `openFirst`** : l'écran n'a qu'à passer
  `Linking.openURL`.
- **`t()`** et `formatDuration` / `formatDistance` (`src/i18n`) : aucun texte
  en dur dans les écrans.
- **`createApiClient`** (`src/core/api.ts`) : session restaurée sans réseau,
  rafraîchissement unique, chaque réponse validée par les schémas de
  `@sira/shared/responses.ts`. Ajouter une route = un schéma de réponse + une
  méthode. `test/driver-scope.e2e.test.ts` côté API vérifie que les vraies
  réponses passent ces schémas.
- **Les écrans lisent SQLite, jamais le réseau** : `useLocal(db => …)` dans
  `src/data.tsx`, relancé à chaque écriture ou synchronisation. Une saisie =
  une méthode de `src/core/local-db.ts` qui écrit la ligne **et** l'entrée de
  file dans la même transaction, puis `written()`.
- **Ajouter une mutation hors-ligne** = un `kind` dans `outboxMutationSchema`
  (`local-db.ts`), son rejeu dans `replay()` (`sync.ts`), et une route API
  idempotente. Les créations portent un UUID client
  (`expo-crypto`), que l'API accepte et rejoue sans doublon.
- **Tester le SQL** : `test/support/sqlite.ts` (vrai SQLite via
  `node:sqlite`) et `test/support/fake-api.ts` (serveur en mémoire, avec
  coupure réseau et réponse perdue simulables).
- Seuls `dispatcher` et `admin` créent des missions — un livreur indépendant
  est `admin` de son organisation, l'app n'affiche le bouton qu'à eux.
- `src/core` ne doit **jamais** importer `react-native` — c'est ce qui le rend
  testable sous Vitest. Stockage et réseau y entrent par interfaces.

Points d'attention :

- Les versions des modules natifs se prennent dans
  `node_modules/expo/bundledNativeModules.json` : `expo install --check` ne
  fonctionne pas ici, `api.expo.dev` étant hors de la politique réseau.
- `expo export` passe hors-ligne avec `EXPO_OFFLINE=1`.
- **Voir les écrans sans téléphone** : ajouter temporairement `react-dom`,
  `react-native-web` et `sql.js`, `"web"` dans les `platforms` d'`app.json`,
  et des doublures `src/platform/*.web.ts` : `secure-session-store`
  (localStorage), `sqlite` (sql.js, avec `sql-wasm.wasm` copié à côté de
  l'export), `network` (événements `online`/`offline`) et `location`
  (`navigator.geolocation`). Puis `expo export --platform web` et Playwright.
  L'API n'ayant pas de CORS, intercepter ses appels avec `page.route` — c'est
  aussi là qu'on simule le mode avion. Tout retirer avant de commiter. Les
  lots 2 et 3 ont été vérifiés ainsi, critère d'acceptation compris.
- `@sira/tsp-core` doit rester du TypeScript pur, sans API Node.
- Les schémas Zod de `@sira/shared` sont partagés : ne pas réécrire les règles
  de validation côté mobile.

---

## Ce qui attend le fondateur

**1. L'autorisation réseau pour Geofabrik, qui clôt la Phase 0.**
`download1.graphhopper.com` est **ouvert** depuis le 25/10/2026 : Photon tourne
sur l'index réel et son contrôle du smoke test est vert.
`download.geofabrik.de` reste refusé — le tunnel s'établit puis l'egress le
ferme à chaque essai (`ws_closed_mid_exchange` dans
`$HTTPS_PROXY/__agentproxy/status`). Sans lui, pas d'extrait OSM d'Abidjan, et
les deux contrôles OSRM restent rouges. Une fois le domaine autorisé
(probablement dans une **nouvelle session**) :

```bash
bash infra/osrm/prepare.sh            # Photon est deja prepare s'il reste infra/photon/photon_data
pnpm infra:up && pnpm infra:smoke
```

Le remède est dans les réglages de l'environnement cloud : menu de
l'environnement dans la barre de titre, puis **Edit → Network access** — soit
un niveau d'accès plus large, soit ce domaine sous « Allowed domains »
en gardant cochée la case des gestionnaires de paquets. Documentation :
<https://code.claude.com/docs/en/cloud-environments#network-access>

**2. Le build Android : EAS ou Gradle local ?** Le critère d'acceptation de
la Phase 3 cite EAS Build, service Expo gratuit sous un quota de builds puis
payant, qui demande un compte et l'envoi du code. Rien n'est configuré tant que
ce n'est pas tranché (`decisions.md`, 25/10/2026). L'alternative sans tiers —
`expo prebuild` puis Gradle — demande un SDK Android sur le poste de build.

_Déjà tranché, rien à redemander :_ la base d'adresses reste **cloisonnée par
organisation** (18/10/2026, pour la sécurité). `organizationId` est obligatoire
en base et la suppression d'une organisation emporte ses adresses.

---

## Dettes mineures ouvertes

- `estimatedDistanceMeters` est persisté à 0 : l'orchestration n'appelle que
  `/table` (durées). Demander aussi les distances coûte un second calcul OSRM ;
  à brancher quand le reporting de la Phase 4 en aura besoin.
- Instance Solomon **R101** introuvable depuis une source accessible ; la
  couverture VRP s'appuie sur C101 plus le critère Abidjan.
- Les messages d'erreur de l'API sont en ASCII (« Numero ou mot de passe
  incorrect ») et le mobile les affiche tels quels. À accentuer côté API —
  ce sont des chaînes destinées à l'utilisateur.
- `planRoute` n'est déterministe que si la recherche converge avant son budget
  de temps : vérifié à 15 arrêts, 8 fois sur 10 à 20. Au-delà, deux appuis
  peuvent donner deux ordres de coût voisin. Remède le jour où cela gêne : un
  budget en itérations dans `tsp-core`, en plus du budget en temps.
