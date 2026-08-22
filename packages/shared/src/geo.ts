/**
 * Primitives geographiques partagees (mobile, api, web).
 * Aucune dependance native : ce code doit tourner tel quel dans React Native.
 */

export interface Coordinates {
  /** Latitude en degres decimaux (WGS 84). */
  lat: number;
  /** Longitude en degres decimaux (WGS 84). */
  lon: number;
}

export interface BoundingBox {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
}

/** Enveloppe du Grand Abidjan — perimetre du pilote (cadrage §8.1). */
export const ABIDJAN_BBOX: BoundingBox = {
  minLat: 5.15,
  minLon: -4.35,
  maxLat: 5.55,
  maxLon: -3.75,
};

/** Enveloppe de la Cote d'Ivoire — garde-fou de validation des coordonnees. */
export const COTE_DIVOIRE_BBOX: BoundingBox = {
  minLat: 4.1,
  minLon: -8.7,
  maxLat: 10.8,
  maxLon: -2.4,
};

const EARTH_RADIUS_M = 6_371_008.8;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/** Distance orthodromique en metres entre deux points. */
export function haversineMeters(a: Coordinates, b: Coordinates): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLon = toRadians(b.lon - a.lon);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isInside(point: Coordinates, box: BoundingBox): boolean {
  return (
    point.lat >= box.minLat &&
    point.lat <= box.maxLat &&
    point.lon >= box.minLon &&
    point.lon <= box.maxLon
  );
}

/**
 * Formatte des coordonnees pour OSRM, qui attend `lon,lat` (et non `lat,lon`).
 * Erreur classique : inverser les deux. Passer systematiquement par ce helper.
 */
export function toOsrmCoordinate(point: Coordinates): string {
  return `${point.lon},${point.lat}`;
}

export function toOsrmCoordinates(points: readonly Coordinates[]): string {
  return points.map(toOsrmCoordinate).join(';');
}
