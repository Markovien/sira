# Où reprendre

État de la session de développement, tenu à jour à chaque lot livré.
Ce document répond à une seule question : **que faire maintenant, et comment
remonter l'environnement pour le faire ?**

- Le _quoi_ et le _comment_ permanents sont dans [`CLAUDE.md`](CLAUDE.md).
- Le _pourquoi_ de chaque choix est dans [`decisions.md`](decisions.md).

---

## En un coup d'œil

|                     |                                                                     |
| ------------------- | ------------------------------------------------------------------- |
| **Branche**         | `claude/phase-0-execution-iyvf4a`                                   |
| **Dernier travail** | orchestration de l'optimisation — `git log -1` pour le détail       |
| **Phase courante**  | 2 terminée ; **la 3 est la prochaine**                              |
| **Bloqué sur**      | rien côté code — deux points attendent le fondateur (voir plus bas) |

| Phase              | État                                                                |
| ------------------ | ------------------------------------------------------------------- |
| 0 — Fondations     | Complète **sauf** le smoke test infra, bloqué par le réseau         |
| 1 — Backend cœur   | ✅ 16 routes, couverture 94 %                                       |
| 2 — Optimisation   | ✅ TSP 0 % d'écart sur berlin52, VRP 0,01 % sur C101, orchestration |
| **3 — Mobile TSP** | **à démarrer**                                                      |
| 4 à 7              | à faire                                                             |

134 tests : 25 dans `@sira/shared`, 17 dans `tsp-core`, 76 côté API (dont 41
de bout en bout), 16 sur le solveur VRP.

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

## Prochaine étape : Phase 3, mobile livreur

Lire d'abord la Phase 3 de [`02-ROADMAP-DEV.md`](02-ROADMAP-DEV.md). Dans
l'ordre des dépendances :

1. Setup Expo + expo-router, thème à fort contraste (usage en plein soleil),
   français par défaut.
2. Écrans : connexion, liste des missions, création, détail.
3. Carte hors-ligne (tuiles vectorielles, MapLibre RN).
4. **Optimisation embarquée** — `@sira/tsp-core` est prêt et déjà validé ;
   c'est le même code que l'API utilise pour le cas mono-véhicule.
5. Navigation par deep link, exécution de tournée, offline-first SQLite.

Points d'attention connus :

- `@sira/tsp-core` doit rester du TypeScript pur, sans API Node — il tourne
  dans Hermes. Son build double ESM/CJS est déjà en place.
- `node-linker=hoisted` est déjà posé dans `.npmrc` pour Expo.
- Les schémas Zod de `@sira/shared` sont partagés : ne pas réécrire les règles
  de validation côté mobile.

---

## Ce qui attend le fondateur

**1. Autorisation réseau — clôt la Phase 0.**
`download.geofabrik.de` et `download1.graphhopper.com` sont refusés par la
politique d'egress (403 au CONNECT), re-testé plusieurs fois. Sans eux, ni
extrait OSM d'Abidjan ni index de géocodage. Probablement une **nouvelle
session** à ouvrir pour que le réglage prenne effet. Ensuite :

```bash
bash infra/osrm/prepare.sh && bash infra/photon/prepare.sh
pnpm infra:up && pnpm infra:smoke
```

**2. Base d'adresses : mutualisée ou cloisonnée ?**
Aujourd'hui cloisonnée par organisation. La mutualiser entre clients
décuplerait sa valeur — c'est l'effet de réseau du cadrage §10.1 — mais engage
la confidentialité des adresses clientes de chacun. Décision commerciale, pas
technique. Détail dans [`decisions.md`](decisions.md).

---

## Dettes mineures ouvertes

- `estimatedDistanceMeters` est persisté à 0 : l'orchestration n'appelle que
  `/table` (durées). Demander aussi les distances coûte un second calcul OSRM ;
  à brancher quand le reporting de la Phase 4 en aura besoin.
- Instance Solomon **R101** introuvable depuis une source accessible ; la
  couverture VRP s'appuie sur C101 plus le critère Abidjan.
- URL de l'index GraphHopper : le seul élément d'infrastructure jamais atteint.
