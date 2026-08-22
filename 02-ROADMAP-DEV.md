# SIRA — Feuille de route de développement

> Document opérationnel destiné à être exécuté par Claude Code, phase par phase.
> Prérequis : lire `01-CADRAGE-PROJET.md`. Chaque phase se termine par ses critères d'acceptation, tous vérifiables automatiquement (tests) ou manuellement en < 5 min.

---

## Conventions générales

- **Monorepo** géré avec pnpm workspaces + Turborepo.
- **Langage** : TypeScript strict partout (backend, mobile, web). Python uniquement pour le microservice VRP (OR-Tools).
- **Qualité** : ESLint + Prettier, tests unitaires Vitest/Jest, CI GitHub Actions (lint + tests sur chaque PR).
- **Git** : conventional commits, une branche par phase (`phase-1-backend-core`, etc.).
- **Secrets** : jamais en dur ; `.env` + `.env.example` maintenu à jour.

### Structure du repo

```
sira/
├── apps/
│   ├── mobile/          # React Native (Expo) — app livreur
│   ├── web/             # React (Vite) — dashboard flotte
│   └── api/             # NestJS — backend principal
├── services/
│   ├── vrp-solver/      # Python FastAPI + OR-Tools
│   └── traffic/         # (Phase 5) apprentissage profils de vitesse
├── packages/
│   ├── tsp-core/        # Solveur TSP TypeScript pur (partagé mobile/serveur)
│   ├── shared/          # Types, schémas Zod, utilitaires
│   └── ui/              # Composants partagés web
├── infra/
│   ├── docker-compose.yml   # postgres+postgis, osrm, photon, api, vrp-solver
│   └── osrm/                # scripts de préparation des données OSM CI
├── data/                # extraits OSM, jeux de test Abidjan
├── CLAUDE.md
└── turbo.json / pnpm-workspace.yaml
```

### Stack retenue

| Composant | Techno | Version cible |
|---|---|---|
| Backend API | NestJS + Prisma + PostgreSQL 16 + PostGIS | Node 22 LTS |
| Mobile | Expo (React Native), expo-sqlite, MapLibre React Native | SDK stable courant |
| Web | React + Vite + TanStack Query + MapLibre GL JS | — |
| Routage | OSRM (Docker, profil `car` puis `motorcycle`) | dernière stable |
| Géocodage | Photon (Docker) sur extrait Côte d'Ivoire | — |
| VRP | Python 3.12 + FastAPI + Google OR-Tools | — |
| Auth | JWT (access + refresh), bcrypt | — |
| Paiement (Phase 6) | CinetPay (sandbox d'abord) | — |

---

## Phase 0 — Fondations (1 semaine)

**Objectif** : monorepo opérationnel, environnement local reproductible en une commande.

Tâches :

1. Initialiser le monorepo (pnpm + Turborepo), ESLint/Prettier partagés, tsconfig de base, CI GitHub Actions.
2. Créer `CLAUDE.md` à la racine : conventions, commandes (`pnpm dev`, `pnpm test`, `docker compose up`), architecture — pour que les sessions Claude Code suivantes aient le contexte.
3. `infra/docker-compose.yml` : PostgreSQL 16 + PostGIS, OSRM, Photon.
4. Script `infra/osrm/prepare.sh` : télécharge l'extrait Geofabrik `cote-divoire-latest.osm.pbf`, exécute `osrm-extract` / `osrm-partition` / `osrm-customize` (pipeline MLD — requis pour la mise à jour des vitesses trafic en Phase 5).
5. Jeu de données de test : `data/abidjan-stops.json` — 60 points de livraison réalistes répartis sur Abidjan (Plateau, Cocody, Marcory, Yopougon, Treichville) avec coordonnées, description d'adresse informelle.

**Critères d'acceptation** : `docker compose up` démarre tout ; `curl` sur OSRM `/route/v1/driving/{coords}` entre deux points d'Abidjan renvoie une route ; Photon géocode « Pharmacie Saint Jean Cocody » ; CI verte.

---

## Phase 1 — Backend cœur (2–3 semaines)

**Objectif** : API REST complète pour gérer utilisateurs, organisations, véhicules, missions et arrêts.

Tâches :

1. Schéma Prisma :
   - `User` (rôles : `driver`, `dispatcher`, `admin`), `Organization`, `Vehicle` (capacité, type moto/tricycle/voiture/camion),
   - `Mission` (date, statut, dépôt de départ/retour, véhicule, livreur),
   - `Stop` (coordonnées PostGIS, adresse texte, description informelle, photo, fenêtre horaire optionnelle, poids/volume optionnels, statut : `pending/delivered/failed/postponed`, preuve de livraison, horodatages),
   - `Address` (base d'adresses propriétaire : coordonnées + libellés + compteur de confirmations).
2. Auth JWT : inscription/connexion par téléphone + mot de passe (l'OTP SMS viendra plus tard), refresh tokens, guards par rôle.
3. CRUD missions/arrêts + import CSV/XLSX d'arrêts (endpoint `POST /missions/:id/stops/import`).
4. Module `routing` : client OSRM typé — `GET /route` (polyline + durée + distance) et `POST /table` (matrice durées/distances N×N, N ≤ 100).
5. Module `geocoding` : Photon d'abord, puis repli sur la table `Address` propriétaire ; chaque livraison confirmée upsert l'adresse (alimente le moat).
6. Tests : unitaires sur services, e2e (Supertest) sur auth + missions + import.

**Critères d'acceptation** : parcours complet par API — créer une org, un dispatcheur, un livreur, une mission de 10 arrêts importés en CSV, obtenir la matrice OSRM. Couverture ≥ 70 % sur les services. Documentation OpenAPI générée (`/docs`).

---

## Phase 2 — Moteur d'optimisation (2–3 semaines)

**Objectif** : TSP embarquable et VRP serveur, testés et benchmarkés.

Tâches :

1. `packages/tsp-core` (TypeScript pur, zéro dépendance native — doit tourner en React Native) :
   - construction du tour : plus proche voisin multi-départs ;
   - amélioration : 2-opt + Or-opt avec limite de temps configurable (défaut 800 ms) ;
   - entrée : matrice de durées + contraintes simples (départ fixe, retour optionnel) ; sortie : ordre + durée totale estimée.
   - Tests : instances TSPLIB de petite taille (`berlin52`…) — écart ≤ 8 % de l'optimum connu ; 50 arrêts résolus < 1 s sur Node.
2. `services/vrp-solver` (FastAPI + OR-Tools) :
   - endpoint `POST /solve` : matrice, K véhicules, capacités, fenêtres horaires, dépôts, durée de service par arrêt ; limite de temps paramétrable (défaut 10 s) ;
   - stratégie : `PATH_CHEAPEST_ARC` + `GUIDED_LOCAL_SEARCH` ;
   - tests sur instances Solomon (C101, R101) : solution faisable, coût dans les 15 % des meilleures références.
3. Endpoint d'orchestration côté API : `POST /missions/:id/optimize` — récupère les arrêts, appelle OSRM `/table`, route vers tsp-core (1 véhicule) ou vrp-solver (K véhicules), persiste l'ordre optimisé et les ETA par arrêt.
4. Benchmark reproductible (`pnpm bench`) documenté dans le README du package.

**Critères d'acceptation** : sur le jeu `abidjan-stops.json`, une mission de 30 arrêts est optimisée en < 2 s (TSP) et une flotte de 3 véhicules × 45 arrêts en < 15 s (VRP), avec ETA cohérents ; tests d'instances de référence verts en CI.

---

## Phase 3 — App mobile livreur, mode TSP (4–5 semaines)

**Objectif** : MVP livreur complet, offline-first, publiable en beta.

Tâches :

1. Setup Expo + navigation (expo-router), thème simple à fort contraste (usage en plein soleil), français par défaut, i18n prêt.
2. Écrans : connexion ; liste des missions ; création de mission (recherche d'adresse via API/repli hors-ligne, ajout par appui long sur carte MapLibre, position GPS courante) ; détail mission.
3. Carte hors-ligne : tuiles vectorielles de la Côte d'Ivoire empaquetées/téléchargeables par région (Protomaps/PMTiles ou MBTiles), affichées via MapLibre RN.
4. Optimisation on-device : intégrer `tsp-core` ; matrice de durées calculée hors-ligne par distance haversine × facteur de vitesse urbaine paramétré par tranche horaire (repli), ou via OSRM si connecté. Afficher l'ordre optimisé, la durée et la distance totales.
5. Navigation déléguée : bouton « Y aller » par arrêt → deep link vers l'app installée (`google.navigation:q=lat,lng`, `geo:` en repli, choix OsmAnd/Waze dans les réglages).
6. Exécution de tournée : marquer livré/échec/reporté, preuve de livraison (photo compressée, signature), re-calcul de l'ordre restant en un tap.
7. Offline-first : SQLite locale, file de synchronisation (mutations horodatées rejouées à la reconnexion), indicateur d'état de sync.
8. Sobriété : GPS échantillonné (toutes les 30 s en tournée uniquement), taille APK < 60 Mo hors tuiles, budget batterie testé.
9. Tests : unitaires sur la logique (sync, solveur, deep links) ; Maestro pour 3 parcours e2e critiques.

**Critères d'acceptation** : en mode avion, un livreur crée une mission de 15 arrêts, l'optimise, exécute la tournée et tout se synchronise à la reconnexion ; build EAS Android installable ; parcours e2e verts.

---

## Phase 4 — Dashboard web flotte, mode VRP (3–4 semaines)

**Objectif** : un dispatcheur planifie et suit les tournées de sa flotte.

Tâches :

1. Setup React + Vite + TanStack Query + MapLibre GL JS, auth partagée avec l'API.
2. Gestion de la flotte : véhicules (capacités), livreurs, affectations.
3. Planification : import CSV/XLSX des courses du jour (avec écran de correction des adresses non géocodées — chaque correction alimente la base `Address`), paramètres (dépôt, fenêtres, capacités), lancement de l'optimisation VRP, visualisation des tournées en couleurs sur carte, ajustement manuel drag-and-drop entre tournées puis ré-optimisation.
4. Diffusion : envoi des tournées vers les apps mobiles des livreurs (les missions apparaissent à leur connexion/sync).
5. Suivi temps réel : positions des livreurs (WebSocket ou polling 30 s), progression par arrêt, alertes retard (ETA dépassé de X min).
6. Reporting : synthèse quotidienne (km, durée, taux de réussite, km théoriques vs réels — la métrique clé du cadrage §10.3), export CSV.

**Critères d'acceptation** : parcours démo complet — import de 45 courses CSV, optimisation en 3 tournées, réception sur 3 comptes livreurs mobiles, suivi de progression en temps réel, rapport de fin de journée exporté.

---

## Phase 5 — Trafic et re-planification dynamique (3–4 semaines)

**Objectif** : l'« IA frugale » trafic du cadrage §6.

Tâches :

1. Collecte : endpoint d'ingestion des traces GPS (opt-in, anonymisées : ID de session éphémère, pas d'ID livreur), échantillonnées, compressées par lots.
2. `services/traffic` : map-matching des traces sur le graphe OSM (OSRM `/match`), agrégation vitesse moyenne par segment × tranche horaire (créneaux de 30 min) × type de jour ; stockage PostGIS.
3. Amorçage sans données : profils génériques Abidjan configurables (pénalités heures de pointe 7h–9h / 17h–20h sur les axes principaux : ponts HKB/De Gaulle, boulevard VGE, autoroute du Nord…).
4. Injection OSRM : génération périodique d'un fichier de mises à jour de vitesses par segment + `osrm-customize` (pipeline MLD de la Phase 0) — le routage devient dépendant de l'heure.
5. Re-planification : job serveur qui recalcule les ETA des tournées actives toutes les 10 min ; si dérive > seuil (configurable, défaut 15 min) ou vitesse anormale détectée sur un axe de la tournée, ré-optimise les arrêts restants et notifie le livreur (push Expo) avec acceptation en un tap.
6. Distillation embarquée : export des profils en table compacte (< 5 Mo) synchronisée sur mobile pour que le repli hors-ligne de la Phase 3 utilise des vitesses réalistes par heure.

**Critères d'acceptation** : test de simulation — rejeu de traces synthétiques créant un « bouchon » sur un axe → le prochain calcul d'itinéraire l'évite et une tournée active est ré-optimisée avec notification ; tout le pipeline tourne sur un seul VPS 8 Go.

---

## Phase 6 — Monétisation freemium (2–3 semaines)

**Objectif** : plans, limites et paiement mobile money.

Tâches :

1. Modèle `Subscription` + gestion des plans (Free / Pro / Business / Enterprise) conformes au cadrage §7 ; les limites (10 arrêts/jour en Free, nombre de véhicules en Business) sont appliquées côté API **et** reflétées dans l'UI avec écrans d'upgrade.
2. Intégration CinetPay en sandbox : initiation de paiement mobile money (Orange Money, MTN MoMo, Wave), webhooks de confirmation idempotents, renouvellement mensuel, période de grâce 7 jours.
3. Facturation : reçus PDF simples, historique des paiements.
4. Feature flags centralisés (`packages/shared`) pour activer/désactiver les capacités par plan sans redéploiement.
5. Événements produit (activation, missions créées, upgrades) vers une table analytics interne — pas d'outil tiers payant à ce stade.

**Critères d'acceptation** : en sandbox, un compte Free atteint sa limite, souscrit Pro via mobile money simulé, les limites se lèvent immédiatement ; l'échec de renouvellement déclenche la période de grâce puis le retour au plan Free.

---

## Phase 7 — Durcissement et lancement pilote (2–3 semaines)

**Objectif** : sécurité, conformité, observabilité, mise en production pour le pilote Abidjan.

Tâches :

1. Sécurité : audit des endpoints (rate limiting, validation Zod systématique, headers), rotation des secrets, chiffrement au repos des données sensibles, scan de dépendances en CI.
2. Conformité loi n°2013-450 / ARTCI : politique de confidentialité, consentement explicite pour la collecte GPS, purge automatique des traces brutes après agrégation (30 jours), export/suppression des données sur demande.
3. Observabilité : logs structurés, Sentry (mobile + web + API), métriques de base (latence optimisation, taux de sync réussie), alertes.
4. Déploiement production : VPS + Docker Compose (suffisant pour le pilote), sauvegardes PostgreSQL quotidiennes testées, domaine + TLS.
5. Publication : build Android signé sur Google Play (piste beta fermée), web déployé ; iOS différé après le pilote.
6. Kit pilote : script de seed des comptes pilotes, tableau de bord des métriques du pilote (gain km/temps théorique vs réel — l'étude de cas du cadrage §8), formulaire de feedback in-app.

**Critères d'acceptation** : environnement de production accessible, beta fermée installable via Play Store, checklist sécurité/conformité validée, restauration de sauvegarde testée avec succès, tableau de métriques pilote alimenté par des données réelles.

---

## Récapitulatif et jalons

| Phase | Durée | Jalon |
|---|---|---|
| 0 — Fondations | 1 sem. | Environnement reproductible |
| 1 — Backend cœur | 2–3 sem. | API missions complète |
| 2 — Optimisation | 2–3 sem. | TSP + VRP benchmarkés |
| 3 — Mobile TSP | 4–5 sem. | **MVP livreur utilisable hors-ligne** |
| 4 — Web VRP | 3–4 sem. | **MVP flotte démontrable aux enseignes** |
| 5 — Trafic | 3–4 sem. | Re-planification dynamique |
| 6 — Freemium | 2–3 sem. | Premiers revenus possibles |
| 7 — Durcissement | 2–3 sem. | **Lancement pilote Abidjan** |

**Total : ~5 à 6 mois** pour un développeur assisté de Claude Code, avec deux jalons commerciaux intermédiaires (fin Phase 3 et fin Phase 4) permettant de démarcher avant la fin du développement.

### Consignes d'exécution pour Claude Code

1. Exécuter les phases dans l'ordre ; ne pas commencer une phase si les critères d'acceptation de la précédente ne sont pas tous verts.
2. En début de chaque phase, créer la branche dédiée et décomposer les tâches en todo-list ; en fin de phase, mettre à jour `CLAUDE.md` (nouvelles commandes, décisions d'architecture).
3. Tout choix d'implémentation ambigu : privilégier systématiquement l'option la plus frugale (données, batterie, coût serveur), conformément au cadrage.
4. Ne jamais introduire de dépendance à une API payante sans validation explicite du fondateur.
