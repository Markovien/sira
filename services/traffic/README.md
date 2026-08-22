# services/traffic — Profils de vitesse et re-planification

**Créé en Phase 5** de la roadmap. Ingestion des traces GPS anonymisées,
map-matching sur le graphe OSM via OSRM `/match`, agrégation de la vitesse
moyenne par segment × créneau de 30 min × type de jour (stockage PostGIS),
génération des fichiers de mise à jour de vitesses pour `osrm-customize` — le
pipeline MLD préparé dès la Phase 0 rend cette étape peu coûteuse.

Conformité (loi n°2013-450, ARTCI) : traces anonymisées par identifiant de
session éphémère, consentement explicite, purge des données brutes 30 jours
après agrégation.
