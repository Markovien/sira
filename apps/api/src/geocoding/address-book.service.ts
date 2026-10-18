import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { GeocodeCandidate } from './photon.service';

/**
 * Base d'adresses proprietaire — l'actif strategique du cadrage §10.1.
 *
 * Chaque livraison confirmee geocode une adresse informelle. A terme cette
 * base vaut plus que l'application : elle sait ou se trouve « le portail bleu
 * a cote du maquis », ce qu'aucune carte publique ne contient.
 *
 * Les requetes spatiales passent par SQL brut : la colonne `geog` est ajoutee
 * par migration et Prisma ne type pas encore `geography`.
 */

/**
 * Rayon d'agregation. 30 m correspond a la dispersion typique d'un releve GPS
 * de smartphone en ville : au-dela on fusionnerait deux commerces voisins, en
 * deca on creerait un doublon a chaque livraison.
 */
const MATCH_RADIUS_METERS = 30;

interface AddressRow {
  id: string;
  label: string;
  addressText: string;
  city: string | null;
  commune: string | null;
  lat: number;
  lon: number;
  confirmationCount: number;
}

@Injectable()
export class AddressBookService {
  private readonly logger = new Logger(AddressBookService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Recherche textuelle floue, via les index trigram. Tolere les fautes de
   * frappe et les accents absents — « pharmacie st jean » doit retrouver
   * « Pharmacie Saint Jean ».
   */
  async searchByText(
    organizationId: string,
    query: string,
    limit = 5,
  ): Promise<GeocodeCandidate[]> {
    const rows = await this.prisma.$queryRaw<AddressRow[]>`
      SELECT id, label, "addressText", city, commune, lat, lon, "confirmationCount"
      FROM "Address"
      WHERE "organizationId" = ${organizationId}
        AND (
          unaccent(label) % unaccent(${query})
          OR unaccent("addressText") % unaccent(${query})
        )
      ORDER BY
        GREATEST(
          similarity(unaccent(label), unaccent(${query})),
          similarity(unaccent("addressText"), unaccent(${query}))
        ) DESC,
        "confirmationCount" DESC
      LIMIT ${limit}
    `;
    return rows.map(toCandidate);
  }

  /** Adresses connues autour d'un point, les mieux confirmees d'abord. */
  async searchNearby(
    organizationId: string,
    point: { lat: number; lon: number },
    radiusMeters = 200,
    limit = 5,
  ): Promise<GeocodeCandidate[]> {
    const rows = await this.prisma.$queryRaw<AddressRow[]>`
      SELECT id, label, "addressText", city, commune, lat, lon, "confirmationCount"
      FROM "Address"
      WHERE "organizationId" = ${organizationId}
        AND ST_DWithin(
          geog,
          ST_SetSRID(ST_MakePoint(${point.lon}, ${point.lat}), 4326)::geography,
          ${radiusMeters}
        )
      ORDER BY
        geog <-> ST_SetSRID(ST_MakePoint(${point.lon}, ${point.lat}), 4326)::geography,
        "confirmationCount" DESC
      LIMIT ${limit}
    `;
    return rows.map(toCandidate);
  }

  /**
   * Enregistre une livraison confirmee. C'est ici que la base se construit :
   * appele a chaque arret passe en `delivered`.
   *
   * Si une adresse connue se trouve dans le rayon d'agregation, son compteur
   * de confirmations augmente et sa position est affinee par moyenne mobile.
   * Le bruit GPS etant de moyenne nulle, chaque confirmation rapproche le point
   * de sa position reelle — et le rayon borne la derive possible.
   */
  async confirmDelivery(input: {
    organizationId: string;
    label: string;
    addressText: string;
    informalDescription?: string | null;
    commune?: string | null;
    lat: number;
    lon: number;
  }): Promise<{ addressId: string; created: boolean }> {
    const [existing] = await this.prisma.$queryRaw<
      { id: string; lat: number; lon: number; confirmationCount: number }[]
    >`
      SELECT id, lat, lon, "confirmationCount"
      FROM "Address"
      WHERE "organizationId" = ${input.organizationId}
        AND ST_DWithin(
          geog,
          ST_SetSRID(ST_MakePoint(${input.lon}, ${input.lat}), 4326)::geography,
          ${MATCH_RADIUS_METERS}
        )
      ORDER BY geog <-> ST_SetSRID(ST_MakePoint(${input.lon}, ${input.lat}), 4326)::geography
      LIMIT 1
    `;

    if (!existing) {
      const created = await this.prisma.address.create({
        data: {
          organizationId: input.organizationId,
          label: input.label,
          addressText: input.addressText,
          informalDescription: input.informalDescription ?? null,
          commune: input.commune ?? null,
          lat: input.lat,
          lon: input.lon,
        },
      });
      return { addressId: created.id, created: true };
    }

    const n = existing.confirmationCount;
    const updated = await this.prisma.address.update({
      where: { id: existing.id },
      data: {
        lat: (existing.lat * n + input.lat) / (n + 1),
        lon: (existing.lon * n + input.lon) / (n + 1),
        confirmationCount: { increment: 1 },
        lastConfirmedAt: new Date(),
        // Une description informelle arrive souvent apres coup : on la garde
        // des qu'elle existe, sans jamais ecraser une description deja saisie.
        ...(input.informalDescription
          ? { informalDescription: input.informalDescription }
          : {}),
      },
    });

    this.logger.debug(`Adresse ${updated.id} confirmee (${updated.confirmationCount} fois)`);
    return { addressId: updated.id, created: false };
  }
}

function toCandidate(row: AddressRow): GeocodeCandidate {
  return {
    label: row.label,
    lat: row.lat,
    lon: row.lon,
    source: 'address-book',
    city: row.city,
    commune: row.commune,
    confirmations: row.confirmationCount,
  };
}
