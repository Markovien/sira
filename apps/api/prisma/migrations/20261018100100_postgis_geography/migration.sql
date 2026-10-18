-- Colonnes spatiales PostGIS pour les trois entites portant des coordonnees.
--
-- Choix : des colonnes GENERATED ... STORED derivees de lat/lon, plutot que des
-- colonnes alimentees par trigger ou par le code applicatif. Les fonctions
-- utilisees sont IMMUTABLE, donc PostgreSQL peut les materialiser lui-meme :
-- aucune desynchronisation possible entre lat/lon et la geometrie, et rien a
-- maintenir cote Prisma, qui ne type pas encore geography nativement.
--
-- lat/lon restent la source de verite : c'est ce que lisent le mobile et le
-- solveur TSP, qui n'ont pas de PostGIS.
--
-- Type geography (et non geometry) : les distances sortent directement en
-- metres sur l'ellipsoide, sans projection a choisir — ce qui compte pour des
-- requetes « arrets a moins de N metres » sur Abidjan comme sur le reste de
-- la sous-region.

ALTER TABLE "Stop"
  ADD COLUMN "geog" geography(Point, 4326)
  GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint("lon", "lat"), 4326)::geography) STORED;

ALTER TABLE "Depot"
  ADD COLUMN "geog" geography(Point, 4326)
  GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint("lon", "lat"), 4326)::geography) STORED;

ALTER TABLE "Address"
  ADD COLUMN "geog" geography(Point, 4326)
  GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint("lon", "lat"), 4326)::geography) STORED;

-- Index GiST : indispensables des que la base d'adresses grossit, car le repli
-- du geocodage cherche l'adresse connue la plus proche d'un point (cadrage §10.1).
CREATE INDEX "Stop_geog_idx" ON "Stop" USING GIST ("geog");
CREATE INDEX "Depot_geog_idx" ON "Depot" USING GIST ("geog");
CREATE INDEX "Address_geog_idx" ON "Address" USING GIST ("geog");

-- Recherche floue sur les libelles d'adresse : second repli quand le point GPS
-- manque et que seul un texte approximatif est disponible.
CREATE INDEX "Address_label_trgm_idx" ON "Address" USING GIN ("label" gin_trgm_ops);
CREATE INDEX "Address_addressText_trgm_idx" ON "Address" USING GIN ("addressText" gin_trgm_ops);
