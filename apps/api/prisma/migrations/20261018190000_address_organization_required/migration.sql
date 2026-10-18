-- Cloisonnement de la base d'adresses : organizationId devient obligatoire.
--
-- Decision du fondateur (decisions.md, 18/10/2026) : la base reste cloisonnee
-- par organisation, pour la securite. Le code filtrait deja sur
-- organizationId, mais la colonne restait nullable — une adresse hors
-- organisation aurait ete invisible a toute requete tout en restant en base.
--
-- onDelete passe de SetNull a Cascade : supprimer une organisation doit
-- emporter ses adresses. La loi ivoirienne n 2013-450 impose de pouvoir
-- supprimer les donnees sur demande (cadrage §9) ; des orphelines rendraient
-- cette suppression impossible a honorer.
--
-- ECRITE A LA MAIN, et il doit en aller de meme pour toute migration touchant
-- Stop, Depot ou Address : `prisma migrate diff` ignore les colonnes
-- generees geog et leurs index GiST/trigram, et propose de les supprimer.

-- Aucune adresse orpheline ne doit subsister : il n'y en a pas en principe,
-- le code ayant toujours renseigne l'organisation.
DELETE FROM "Address" WHERE "organizationId" IS NULL;

ALTER TABLE "Address" ALTER COLUMN "organizationId" SET NOT NULL;

ALTER TABLE "Address" DROP CONSTRAINT "Address_organizationId_fkey";
ALTER TABLE "Address"
  ADD CONSTRAINT "Address_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
