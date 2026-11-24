# Bilan d'avancement — SIRA

**Arrêté au 24 novembre 2026.** Instantané destiné à une nouvelle session
Claude Code : ce qui est fait, ce qui est vérifié, ce qui reste, et où se
trouve chaque chose. Pour la marche à suivre au quotidien, lire ensuite
[`REPRISE.md`](REPRISE.md) ; pour le pourquoi de chaque choix,
[`decisions.md`](decisions.md).

---

## Situation du dépôt

|                           |                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------- |
| **Dépôt**                 | `Markovien/sira`                                                                |
| **Branche de travail**    | `claude/phase-0-execution-iyvf4a` — imposée par le fondateur, tout y est        |
| **Pull request**          | aucune ouverte                                                                  |
| **Avance sur `main`**     | 53 commits au 24/11/2026, lot 5 compris (`git log --oneline origin/main..HEAD`) |
| **CI GitHub**             | 6 travaux, tous verts sur le dernier commit poussé                              |
| **Journal des décisions** | 53 entrées, chacune écrite avant d'être appliquée                               |
| **Tests**                 | 291, tous verts (détail plus bas)                                               |

---

## Vue d'ensemble des phases

| Phase              | État             | En une phrase                                                                       |
| ------------------ | ---------------- | ----------------------------------------------------------------------------------- |
| 0 — Fondations     | **Non close**    | Tout fonctionne, sauf le routage sur la vraie carte d'Abidjan, bloqué par le réseau |
| 1 — Backend cœur   | ✅ Terminée      | API missions complète, 94 % des services couverts                                   |
| 2 — Optimisation   | ✅ Terminée      | TSP à 0 % de l'optimum (berlin52), VRP à 0,01 % (Solomon C101)                      |
| 3 — Mobile livreur | **6 lots sur 6** | Code complet ; restent l'essai sur un vrai téléphone et les parcours Maestro        |
| 4 — Web VRP        | À faire          | Dashboard flotte                                                                    |
| 5 — Trafic         | À faire          | Re-planification dynamique                                                          |
| 6 — Freemium       | À faire          | Paiement mobile money                                                               |
| 7 — Durcissement   | À faire          | Lancement pilote Abidjan                                                            |

---

## Phase 0 — un seul blocage, extérieur au code

Le smoke test (`pnpm infra:smoke`) passe **2 contrôles sur 4** :

- ✅ PostgreSQL + PostGIS ;
- ✅ Photon sur l'index réel de la Côte d'Ivoire : « Pharmacie Saint Jean
  Cocody » → Pharmacie Saint-Jean, Cocody (5,337 ; −4,004). Index GraphHopper
  épinglé à la version datée `250720` et vérifié par MD5, le lien `-latest`
  étant cassé chez GraphHopper ;
- ❌ OSRM, route Plateau → Cocody ;
- ❌ OSRM, matrice 3 × 3.

**Cause unique** : `download.geofabrik.de` est refusé par la politique réseau
de l'environnement cloud (re-testé le 24/11/2026 : le tunnel s'établit puis
l'egress le ferme, `ws_closed_mid_exchange`). Sans l'extrait
`ivory-coast-latest.osm.pbf`, OSRM n'a pas de carte d'Abidjan. La chaîne OSRM
elle-même (image, pipeline MLD, `/route`, `/table`) est validée sur un extrait
synthétique (`infra/osrm/verify-pipeline.sh`, `run-synthetic.sh`).

**Remède** (fondateur) : réglages de l'environnement → _Edit → Network access_
→ ajouter `download.geofabrik.de`. Puis :

```bash
bash infra/osrm/prepare.sh && pnpm infra:up && pnpm infra:smoke
```

Règle tenue : ne jamais contourner un refus de politique réseau (pas de miroir
non officiel pour des données de production — `decisions.md`, 18/10/2026).

---

## Phases 1 et 2 — terminées (sessions précédentes)

- **API** (`apps/api`, NestJS + Prisma + PostGIS) : authentification par
  téléphone (JWT à rotation), missions et arrêts, import CSV/XLSX, routage
  OSRM, géocodage Photon + base d'adresses propriétaire, optimisation.
  Cloisonnement par organisation imposé par la signature des services et par
  la base.
- **`packages/tsp-core`** : solveur TSP en TypeScript pur, embarqué dans
  Hermes, utilisé par l'API et par le mobile.
- **`services/vrp-solver`** : FastAPI + OR-Tools, `POST /solve`.

Ajouts à l'API pendant la Phase 3 (avec leurs tests e2e) :

- **carte hors-ligne** : `GET /tiles/manifest` et `GET /tiles/abidjan.pmtiles`,
  authentifiés, avec ETag et requêtes de plage ;

- un livreur ne voit et ne modifie que **ses** missions (faille corrigée) ;
- création **idempotente** de missions et d'arrêts par UUID fourni par le
  client ; 409 si l'identifiant est pris ailleurs ;
- **heure de livraison** déclarée par le téléphone, corrigée par l'en-tête
  `X-Device-Time`, bornée, et marquée `timeSuspect` si douteuse ; heure brute
  gardée dans `reportedCompletedAt` (migration SQL écrite à la main) ;
- schémas de **réponse** dans `@sira/shared/responses.ts`, vérifiés contre les
  vraies réponses (`apps/api/test/driver-scope.e2e.test.ts`).

---

## Phase 3 — application mobile livreur

Expo SDK 58, expo-router, React Native 0.88. La logique vit dans
`apps/mobile/src/core/` (TypeScript pur, **sans import de `react-native`**,
testé sous Vitest en Node) ; les écrans (`apps/mobile/app/`) restent minces.

### Lots

| Lot | Contenu                                                                                                 | État                     |
| --- | ------------------------------------------------------------------------------------------------------- | ------------------------ |
| 1   | Squelette Expo, thème contrasté, textes FR typés ; matrice hors-ligne ; `planRoute` ; liens « Y aller » | ✅                       |
| 2   | Connexion persistante hors-ligne (Keystore), client API validé par Zod, liste et détail                 | ✅                       |
| 3   | SQLite locale, file d'envoi, synchronisation, création de mission hors-ligne, matrices OSRM via l'API   | ✅                       |
| 4   | Exécution de tournée : statuts, motifs, photo compressée, signature, recalcul de l'ordre restant        | ✅                       |
| 5   | Carte MapLibre hors-ligne : extrait Protomaps d'Abidjan servi par l'API, appui long pour ajouter        | ✅ (non vu sur appareil) |
| 6   | GPS 30 s, 3 parcours Maestro (écrits, non exécutés), APK Gradle local (30 Mo)                           | ✅                       |

### Ce que fait l'application

- **Session** : jeton de rafraîchissement dans `expo-secure-store`, restaurée
  sans réseau ; jeton d'accès en mémoire ; un seul rafraîchissement à la fois.
- **Hors-ligne** : les écrans lisent SQLite (`useLocal`, `src/data.tsx`) ;
  chaque saisie écrit la ligne et l'entrée de file dans la même transaction ;
  la file est rejouée dans l'ordre à l'ouverture, au retour du réseau, après
  chaque saisie et au geste « tirer pour rafraîchir ». Refus définitif (4xx)
  écarté sans bloquer la suite. Aucun doublon, même sur réponse perdue.
- **Saisie d'arrêt** : clients déjà servis (recherche locale), recherche en
  ligne (Photon + base d'adresses), ou position courante.
- **Optimisation embarquée** : matrices OSRM par l'API si le réseau répond en
  5 s, sinon estimation de repli (haversine × 1,35, vitesse selon la tranche
  horaire, Abidjan en GMT).
- **Navigation** : Google Maps, OsmAnd ou Waze par lien profond, `geo:` en
  dernier recours.
- **Exécution** : livré / échec / reporté avec motif ; photo par l'appareil du
  système, sous-échantillonnée à 800 px, JPEG 0,5 (50–100 Ko) ; signature en
  tracé SVG. Preuves dans le répertoire privé, **jamais envoyées**, purgées à
  30 jours à chaque ouverture.
- **Anti-triche horaire** : le téléphone signale une horloge reculée
  (`clockWentBack`), le serveur corrige et borne l'heure.
- **Carte hors-ligne** : extrait Protomaps du Grand Abidjan (7,2 Mo, zooms
  0–14, OpenStreetMap sous ODbL) servi par l'API (`GET /tiles/*`), téléchargé
  sur Wi-Fi ou à la demande, vérifié par taille et MD5, lu sur le disque par
  MapLibre. Glyphes et sprite embarqués : aucune requête réseau à
  l'affichage. Arrêts numérotés comme la liste, tracé des arrêts restants,
  appui long pour ajouter un arrêt (adresses déjà livrées tout près
  proposées en ligne).
- **GPS** : un seul échantillonneur, 30 s / 50 m, précision équilibrée,
  premier plan, écran de tournée ouvert ; rien n'est stocké ni envoyé.
- **Sécurité** : base locale vidée si un autre utilisateur se connecte, et à
  la déconnexion volontaire (confirmation s'il reste des saisies).

### APK Android

- Construit en local avec Gradle (`apps/mobile/scripts/build-android.sh`),
  sans EAS, conformément à l'arbitrage du fondateur.
- **30 Mo**, deux architectures ARM (`arm64-v8a`, `armeabi-v7a`),
  bibliothèques natives compressées : sans cela, MapLibre portait l'APK à
  66 Mo (`decisions.md`, 24/11/2026).
- Permissions : localisation au premier plan, appareil photo, Internet, état
  du réseau. Bloquées dans `app.json` : stockage externe,
  `SYSTEM_ALERT_WINDOW`, biométrie, vibration.
- Signé avec la **clé de debug** : pour essayer, pas pour distribuer.

### Vérifications effectuées

- **Carte** : style, archive réelle, glyphes et sprite rendus dans Chromium
  avec MapLibre GL JS (même spécification de style que le moteur natif) —
  fond d'Abidjan, noms accentués, arrêts et tracé, sans requête réseau ni
  erreur. Ce rendu a révélé qu'une plage de glyphes manquante empêchait de
  dessiner des tuiles entières ; corrigé avant tout essai sur appareil.

- Critère d'acceptation joué dans Chromium (doublures web temporaires) contre
  l'API réelle : mission de 15 arrêts créée en mode avion sans aucun appel
  réseau, optimisée, exécutée, puis tout synchronisé à la reconnexion — 1
  mission et 15 arrêts en base, aucun doublon, heures non suspectes.
- **Jamais exécuté sur un vrai téléphone ni un émulateur** : pas de
  virtualisation matérielle dans l'environnement cloud (`/dev/kvm` absent).

---

## Tests et intégration continue

| Paquet                  | Tests                                  |
| ----------------------- | -------------------------------------- |
| `@sira/shared`          | 54                                     |
| `@sira/tsp-core`        | 12                                     |
| `apps/api`              | 113 (39 unitaires, 74 de bout en bout) |
| `services/vrp-solver`   | 16                                     |
| `apps/mobile` (logique) | 96                                     |
| **Total**               | **291**                                |

CI (`.github/workflows/ci.yml`) : qualité TS (format, build, lint, types,
tests), jeu de données, scripts et docker-compose, solveur VRP, API compilée
(e2e + couverture ≥ 70 %), bundle mobile Android (< 8 Mo).

Défauts trouvés par les tests avant tout usage, corrigés : arrêts effacés par
un `INSERT OR REPLACE` en cascade ; pavé de signature hors de l'écran ; accès
d'un livreur aux tournées de ses collègues.

---

## Arbitrages du fondateur, déjà appliqués

- Base d'adresses **cloisonnée par organisation** (18/10/2026).
- **Build Android en Gradle local**, sans EAS (26/10/2026).
- **Heure de livraison** : celle du téléphone, corrigée par l'heure du serveur
  et contrôlée contre la triche (26/10/2026).
- **Preuves** : compressées, gardées 30 jours sur le téléphone, rien sur un
  serveur avant le passage à l'échelle (26/10/2026).
- Démarrer la Phase 3 malgré la Phase 0 ouverte, la Phase 3 ne dépendant pas
  des données d'Abidjan.

---

## Ce qui reste à faire

### Pour clore la Phase 3

1. **Essayer la carte sur un téléphone** : le lot 5 est livré (`decisions.md`,
   24/11/2026), mais le rendu par le moteur natif, l'appui long et le mode
   avion n'ont été vus que dans Chromium (MapLibre GL JS, même style, même
   archive). Préparer d'abord l'extrait sur le serveur :
   `bash infra/tiles/extract.sh`.
2. **Exécuter les 3 parcours Maestro** (`apps/mobile/.maestro/`) sur un
   émulateur ou un téléphone.
3. **Installer l'APK sur un vrai téléphone** : appareil photo, GPS, Keystore
   et mode avion n'ont été vus qu'à travers des doublures web.
4. **Clé de signature de production**, créée sur le poste du fondateur, hors
   dépôt.

### Pour clore la Phase 0

5. Autoriser `download.geofabrik.de`, puis préparer OSRM et repasser le smoke
   test.

### Dettes notées, non bloquantes

- Une mission ne passe pas seule `in_progress` / `completed` (à décider en
  Phase 4).
- Le dispatcheur ne voit pas encore `timeSuspect` ni les preuves (Phase 4,
  puis stockage serveur des preuves).
- `react-native-reanimated`, `-worklets` et `-gesture-handler` sont liés dans
  l'APK sans être utilisés (~5 Mo) ; à retirer après vérification sur
  appareil.
- Messages d'erreur de l'API en ASCII (« Numero ou mot de passe incorrect »).
- `planRoute` non déterministe au-delà d'une vingtaine d'arrêts (deux ordres
  de coût voisin).
- `estimatedDistanceMeters` persisté à 0 par l'orchestration serveur.
- Instance Solomon R101 introuvable ; la couverture VRP repose sur C101.

### Phases suivantes (roadmap)

- **4 — Dashboard web flotte** : import des courses, VRP, diffusion aux
  livreurs, suivi temps réel, rapport de fin de journée.
- **5 — Trafic** : traces GPS avec consentement, vitesses par tranche horaire,
  injection OSRM (`osrm-customize`, pipeline MLD prévu pour), re-planification.
- **6 — Freemium** : plans, limites, CinetPay (Orange Money, MTN, Wave) en
  sandbox.
- **7 — Durcissement** : sécurité, conformité loi n° 2013-450 / ARTCI,
  production, Google Play (beta fermée).

---

## Ce qui attend le fondateur

1. Autoriser `download.geofabrik.de` (clôture de la Phase 0).
2. Un essai sur un téléphone Android, et si possible les parcours Maestro sur
   un poste avec émulateur.
3. Essayer la carte hors-ligne sur ce même téléphone (voir plus haut).
