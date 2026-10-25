-- Heure de livraison declaree par le telephone, et drapeau de vraisemblance
-- (decisions.md, 26/10/2026).
--
-- `completedAt` reste l'heure retenue ; `reportedCompletedAt` garde l'heure
-- brute envoyee par le telephone, pour qu'un litige puisse comparer les deux.
--
-- ECRITE A LA MAIN : `prisma migrate diff` ignore la colonne generee geog de
-- Stop et proposerait de la supprimer.

ALTER TABLE "Stop" ADD COLUMN "reportedCompletedAt" TIMESTAMP(3);
ALTER TABLE "Stop" ADD COLUMN "timeSuspect" BOOLEAN NOT NULL DEFAULT false;
