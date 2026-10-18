import { Inject, Injectable, Logger } from '@nestjs/common';
import { ABIDJAN_BBOX, type Coordinates } from '@sira/shared';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';

/**
 * Client Photon (roadmap Phase 1.5).
 *
 * Photon ne connait que ce qu'OpenStreetMap contient. A Abidjan, cela couvre
 * les grands axes et les lieux-dits, pas « le portail bleu a cote du maquis ».
 * C'est pourquoi il n'est qu'une moitie du geocodage : l'autre est la base
 * d'adresses proprietaire, qui apprend du terrain.
 *
 * Une indisponibilite de Photon ne doit jamais faire echouer une recherche —
 * elle degrade vers la base proprietaire. D'ou un service qui renvoie une
 * liste vide plutot que de lever.
 */

const REQUEST_TIMEOUT_MS = 5_000;

/** Centre d'Abidjan, pour biaiser les resultats vers le perimetre du pilote. */
const ABIDJAN_CENTER: Coordinates = {
  lat: (ABIDJAN_BBOX.minLat + ABIDJAN_BBOX.maxLat) / 2,
  lon: (ABIDJAN_BBOX.minLon + ABIDJAN_BBOX.maxLon) / 2,
};

export interface GeocodeCandidate {
  label: string;
  lat: number;
  lon: number;
  /** Ce qui a produit ce resultat : l'appelant doit pouvoir les distinguer. */
  source: 'photon' | 'address-book';
  city: string | null;
  commune: string | null;
  /** Nombre de livraisons ayant confirme ce point. Absent pour Photon. */
  confirmations?: number;
}

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: Record<string, unknown>;
}

@Injectable()
export class PhotonService {
  private readonly logger = new Logger(PhotonService.name);

  constructor(@Inject(ENV) private readonly env: Env) {}

  /** Renvoie une liste vide si Photon est indisponible, jamais une erreur. */
  async search(query: string, limit = 5): Promise<GeocodeCandidate[]> {
    const params = new URLSearchParams({
      q: query,
      limit: String(limit),
      lang: 'fr',
      // Biais geographique : « pharmacie » doit remonter Abidjan, pas Paris.
      lat: String(ABIDJAN_CENTER.lat),
      lon: String(ABIDJAN_CENTER.lon),
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${this.env.PHOTON_URL}/api?${params.toString()}`, {
        signal: controller.signal,
      });
      if (!response.ok) {
        this.logger.warn(`Photon a repondu ${response.status}`);
        return [];
      }

      const body = (await response.json()) as { features?: PhotonFeature[] };
      return (body.features ?? []).flatMap(toCandidate);
    } catch (error) {
      // Degradation volontaire : la base proprietaire prend le relais.
      this.logger.warn(`Photon injoignable sur ${this.env.PHOTON_URL}`, error);
      return [];
    } finally {
      clearTimeout(timeout);
    }
  }
}

function toCandidate(feature: PhotonFeature): GeocodeCandidate[] {
  const coordinates = feature.geometry?.coordinates;
  if (!coordinates || coordinates.length < 2) return [];

  // GeoJSON ordonne [lon, lat] : l'inversion habituelle guette ici aussi.
  const [lon, lat] = coordinates;
  const properties = feature.properties ?? {};

  const label = [properties.name, properties.street, properties.district]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join(', ');

  if (!label) return [];

  return [
    {
      label,
      lat,
      lon,
      source: 'photon',
      city: typeof properties.city === 'string' ? properties.city : null,
      commune: typeof properties.district === 'string' ? properties.district : null,
    },
  ];
}
