/** Vocabulaire metier commun a l'API, au mobile et au dashboard. */

export const USER_ROLES = ['driver', 'dispatcher', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const VEHICLE_TYPES = ['moto', 'tricycle', 'voiture', 'camionnette', 'camion'] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

export const MISSION_STATUSES = [
  'draft',
  'planned',
  'in_progress',
  'completed',
  'cancelled',
] as const;
export type MissionStatus = (typeof MISSION_STATUSES)[number];

export const STOP_STATUSES = ['pending', 'delivered', 'failed', 'postponed'] as const;
export type StopStatus = (typeof STOP_STATUSES)[number];

export const SUBSCRIPTION_PLANS = ['free', 'pro', 'business', 'enterprise'] as const;
export type SubscriptionPlan = (typeof SUBSCRIPTION_PLANS)[number];

/** Limites du plan Free (cadrage §7) — appliquees cote API en Phase 6. */
export const FREE_PLAN_MAX_STOPS_PER_DAY = 10;

/**
 * Vitesses urbaines de repli (km/h) utilisees hors-ligne quand OSRM est
 * injoignable (roadmap Phase 3.4). Remplacees en Phase 5 par les profils
 * appris sur les traces GPS des livreurs.
 */
export const FALLBACK_URBAN_SPEEDS_KMH = {
  /** 7h-9h et 17h-20h : ponts et axes satures. */
  peak: 12,
  /** Journee ouvree hors pointe. */
  offPeak: 22,
  /** Nuit et dimanche matin. */
  free: 32,
} as const;

/** Detour moyen route/vol d'oiseau observe en zone urbaine dense. */
export const URBAN_DETOUR_FACTOR = 1.35;
