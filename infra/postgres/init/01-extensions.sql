-- Extensions requises par le schema Prisma (Phase 1).
-- Executees automatiquement au premier demarrage du conteneur postgres.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
-- Recherche floue sur la base d'adresses proprietaire (repli du geocodage).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
