# SIRA — Optimisation de tournées de livraison urbaine en Côte d'Ivoire

> *« Sira » signifie « chemin » en dioula. Nom de code provisoire, à valider.*
> Document de cadrage — v1.0 — Août 2026

---

## 1. Vision

SIRA est une application web et mobile qui planifie et optimise les tournées de livraison urbaine en Côte d'Ivoire. À partir des missions du jour et des lieux à visiter, elle calcule le meilleur ordre de passage et le meilleur itinéraire (TSP pour un livreur seul, VRP pour une flotte), puis réajuste la planification en temps réel selon l'état du trafic.

**Différenciateurs clés :**

1. **Frugalité** : l'optimisation tourne sur des smartphones Android d'entrée de gamme, sans dépendance à des API cartographiques payantes (Google Maps API), grâce à OpenStreetMap et à des heuristiques légères embarquées.
2. **Adaptée au terrain ivoirien** : adressage informel (points GPS + description + photo plutôt que noms de rue), mode hors-ligne complet, paiement mobile money, faible consommation data et batterie.
3. **Robustesse au trafic** : re-planification dynamique fondée sur des données de trafic collectées par les livreurs eux-mêmes (crowdsourcing) et des profils horaires appris — pas d'achat de données trafic externes.

## 2. Problème adressé

- À Abidjan et dans les grandes villes ivoiriennes, les tournées sont planifiées manuellement ou à l'intuition : détours inutiles, carburant gaspillé, livraisons ratées, ETA non fiables.
- Les solutions existantes (Onfleet, Routific, Google Route Optimization…) sont chères (facturation en USD par tâche/véhicule), pensées pour un adressage formel, et gourmandes en data — inadaptées au marché local.
- Le trafic abidjanais (ponts, carrefours saturés, heures de pointe) rend une planification statique rapidement obsolète.

## 3. Cibles et cas d'usage

| Segment | Cas d'usage | Mode |
|---|---|---|
| **Livreur indépendant** (moto/tricycle, e-commerce, restauration) | Saisit ses points de livraison du jour, obtient l'ordre optimal et navigue | TSP |
| **PME / commerces** (2–15 véhicules) | Un dispatcheur importe les courses, l'app répartit et ordonne les tournées | VRP |
| **Grandes enseignes** (La Poste CI, AGL, e-commerçants, distributeurs) | Intégration API, tournées multi-dépôts, contraintes (capacités, fenêtres horaires), reporting | VRP avancé |

## 4. Fonctionnalités

### MVP (V1)

- Création de mission : ajout d'arrêts par recherche d'adresse, point sur carte, coordonnées GPS, ou import CSV/Excel (flotte).
- Optimisation TSP on-device (livreur seul) et VRP côté serveur (flotte) : capacités véhicules, fenêtres horaires, dépôt de départ/retour.
- Carte OSM embarquée (tuiles téléchargeables par ville pour usage hors-ligne).
- Navigation déléguée à l'app GPS déjà installée (Google Maps, OsmAnd, Waze) via *deep links* : SIRA calcule l'ordre et les étapes, le guidage vocal reste dans l'app du téléphone → **zéro coût d'API de navigation**.
- Suivi de tournée : statut par arrêt (livré / échec / reporté), preuve de livraison (photo, signature, code).
- Mode hors-ligne complet avec synchronisation différée.
- Dashboard web pour les flottes : planification, carte des tournées, suivi temps réel, exports.

### V2

- Re-planification dynamique selon le trafic (voir §6).
- Notification ETA au destinataire par SMS/WhatsApp.
- Base d'adresses propriétaire enrichie par l'usage (géocodage des adresses informelles) — **actif stratégique majeur**.
- Analytics flotte : km parcourus, taux de réussite, coût par livraison.
- API publique pour intégration aux SI des grandes enseignes.

## 5. Architecture technique (frugale par conception)

| Couche | Choix | Justification |
|---|---|---|
| Cartographie | OpenStreetMap (extrait Côte d'Ivoire, ~50 Mo) + tuiles MapLibre | Gratuit, hors-ligne, souverain |
| Géocodage | Photon/Nominatim auto-hébergé + base d'adresses propriétaire | Zéro coût API, moat |
| Calcul d'itinéraires | OSRM auto-hébergé (serveur) ; hors-ligne sur mobile : estimation par distance à vol d'oiseau × profils de vitesse urbains par heure (graphe embarqué en évolution ultérieure) | Millisecondes, gratuit |
| Optimisation TSP (mobile) | Heuristiques légères : plus proche voisin + 2-opt/Or-opt, en TypeScript | < 1 s pour 50 arrêts sur un Android à 60 000 FCFA |
| Optimisation VRP (serveur) | Google OR-Tools (open source) | Référence du domaine, gratuit |
| « IA frugale » trafic | Profils de vitesse par segment/heure appris sur les traces GPS anonymisées des livreurs ; modèle léger (tables + gradient boosting), exécutable serveur et embarquable | Pas d'achat de données trafic ; s'améliore avec l'usage |
| Mobile | React Native (Expo), offline-first (SQLite) | Une base de code Android + iOS, ciblage Android prioritaire |
| Web + Backend | React / Node.js / PostgreSQL + PostGIS | Standard, recrutement facile |

**Principe directeur** : chaque téléphone livreur est autonome (carte + solveur TSP embarqués). Le serveur n'est requis que pour la flotte (VRP), la synchronisation et le trafic. Coût marginal par utilisateur quasi nul.

## 6. Robustesse au trafic (V2)

1. **Collecte** : l'app remonte des traces GPS anonymisées et échantillonnées pendant les tournées (opt-in, faible data).
2. **Apprentissage** : vitesses moyennes par segment routier × tranche horaire × jour de semaine → profils de coûts injectés dans OSRM (mise à jour des vitesses par segment).
3. **Réaction temps réel** : si l'ETA dérive au-delà d'un seuil (retard, bouchon détecté par vitesse anormalement basse de plusieurs livreurs sur un axe), re-optimisation de la fin de tournée et notification du livreur.

Cette approche « crowdsourcée » évite tout coût de licence trafic et crée un effet de réseau : plus il y a de livreurs, meilleur est le trafic prédit.

## 7. Business model — Freemium

| Offre | Cible | Contenu | Prix indicatif |
|---|---|---|---|
| **Free** | Livreur indépendant | 1 utilisateur, 10 arrêts/jour, TSP, hors-ligne | 0 FCFA |
| **Pro** | Livreur intensif | Arrêts illimités, preuve de livraison, historique, trafic | ~2 500 FCFA/mois (mobile money) |
| **Business** | PME flottes | VRP, dashboard, suivi temps réel, jusqu'à N véhicules | ~5 000 FCFA/véhicule/mois |
| **Enterprise** | La Poste, AGL… | API, multi-dépôts, SLA, intégration SI, données | Sur devis (licence annuelle) |

- Paiement via mobile money (Orange Money, MTN MoMo, Wave) par agrégateur (CinetPay ou équivalent).
- Le plan Free alimente la base d'adresses et les données trafic → les gratuits créent de la valeur pour les payants.
- Viabilité : coûts d'infrastructure faibles (OSM + OR-Tools auto-hébergés, un VPS suffit pour des milliers d'utilisateurs) ; le point mort dépend surtout des coûts commerciaux, pas techniques.

## 8. Go-to-market proposé

1. **Pilote (3 mois)** : 20–50 livreurs indépendants à Abidjan (Cocody, Plateau, Marcory) + 1 PME partenaire. Objectif : prouver un gain mesurable (−15 à −25 % de km/temps par tournée).
2. **Étude de cas chiffrée** → démarchage des grandes enseignes (La Poste CI, AGL, e-commerçants) avec preuves terrain.
3. **Extension** : Bouaké, San-Pédro, Yamoussoukro, puis sous-région UEMOA (le socle OSM/frugal est répliquable pays par pays).

## 9. Risques et parades

| Risque | Parade |
|---|---|
| Qualité OSM inégale hors Abidjan | Contribution OSM ciblée ; base d'adresses propriétaire ; le pilote reste sur Abidjan (bien cartographiée) |
| Adoption par des livreurs peu « tech » | UX ultra-simple, onboarding vocal/visuel, support WhatsApp |
| Volume de données trafic insuffisant au départ | Démarrage avec profils horaires génériques (heures de pointe connues), enrichis progressivement |
| Concurrence (Google, acteurs SaaS) | Positionnement prix local, hors-ligne, adressage informel = barrières spécifiques au marché |
| Conformité données personnelles | Respect de la loi ivoirienne n°2013-450 (ARTCI) : anonymisation des traces, consentement, déclaration |

## 10. Recommandations d'expert (hors périmètre initial, à fort impact)

1. **La base d'adresses est le vrai moat** : chaque livraison confirmée géocode une adresse informelle. À terme, cette base vaut plus que l'app.
2. **Notification ETA destinataire** (SMS/WhatsApp) : réduit fortement les échecs de livraison (destinataire absent), argument commercial n°1 auprès des enseignes.
3. **Mesurer dès le jour 1** : km et durée théoriques vs réels par tournée. C'est la matière première de l'étude de cas qui vendra l'offre Enterprise.
4. **Prévoir le multi-pays dès l'architecture** (extraits OSM par pays, devises, opérateurs mobile money) sans le développer maintenant.
5. **Statut juridique et propriété intellectuelle** : déposer la marque à l'OAPI, héberger le code sur un repo privé avec contrats de cession pour tout prestataire.
