import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Garde-fou sur la structure de la base.
 *
 * `prisma migrate diff` ignore les colonnes generees `geog` et leurs index
 * GiST et trigram : il propose de les supprimer, et de retirer le DEFAULT des
 * colonnes generees — ce qui les casserait. Une migration produite sans
 * relecture emporterait donc toute la couche spatiale, sans qu'aucun test
 * fonctionnel ne s'en apercoive : les requetes de proximite tomberaient
 * simplement en balayage sequentiel, ou echoueraient.
 *
 * Ces assertions echouent si cela arrive.
 */

let app: INestApplication;
let prisma: PrismaService;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
  prisma = app.get(PrismaService);
});

afterAll(async () => {
  if (app) await app.close();
});

describe('Integrite du schema', () => {
  it('conserve les trois colonnes geographiques generees', async () => {
    const rows = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.columns
      WHERE column_name = 'geog' AND is_generated = 'ALWAYS'
      ORDER BY table_name
    `;
    expect(rows.map((row) => row.table_name)).toEqual(['Address', 'Depot', 'Stop']);
  });

  it('conserve les index spatiaux et trigram', async () => {
    const rows = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE indexname IN (
        'Stop_geog_idx', 'Depot_geog_idx', 'Address_geog_idx',
        'Address_label_trgm_idx', 'Address_addressText_trgm_idx'
      )
    `;
    expect(rows).toHaveLength(5);
  });

  it('impose une organisation sur chaque adresse', async () => {
    // Le cloisonnement de la base d'adresses est une exigence de securite
    // (decisions.md) : il tient au niveau de la base, pas seulement du code.
    const [column] = await prisma.$queryRaw<{ is_nullable: string }[]>`
      SELECT is_nullable FROM information_schema.columns
      WHERE table_name = 'Address' AND column_name = 'organizationId'
    `;
    expect(column?.is_nullable).toBe('NO');
  });

  it('supprime les adresses avec leur organisation, sans orpheline', async () => {
    // La loi n 2013-450 impose de pouvoir supprimer les donnees sur demande :
    // une adresse orpheline ne serait plus ni consultable ni purgeable.
    const organization = await prisma.organization.create({
      data: { name: 'Organisation jetable — test de cascade' },
    });
    const address = await prisma.address.create({
      data: {
        organizationId: organization.id,
        label: 'Adresse jetable',
        addressText: 'Abidjan',
        lat: 5.33,
        lon: -4.01,
      },
    });

    await prisma.organization.delete({ where: { id: organization.id } });

    expect(await prisma.address.findUnique({ where: { id: address.id } })).toBeNull();
  });
});
