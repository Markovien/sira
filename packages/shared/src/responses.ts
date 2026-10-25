import { z } from 'zod';
import { MISSION_STATUSES, STOP_STATUSES, USER_ROLES } from './domain.js';

/**
 * Forme des reponses de l'API, validee par les clients a la frontiere
 * (decisions.md, 25/10/2026). Les cles inconnues sont ignorees : une API qui
 * ajoute un champ ne casse pas un client plus ancien. Les dates restent des
 * chaines ISO, telles que serialisees par l'API et telles que stockees en local.
 */

const isoDateTime = z.string().datetime({ offset: true });
const nullableText = z.string().nullable();

export const authUserSchema = z.object({
  id: z.string().min(1),
  phone: z.string(),
  fullName: z.string(),
  role: z.enum(USER_ROLES),
  organizationId: z.string().min(1),
});

export const tokenPairSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
});

export const authResponseSchema = tokenPairSchema.extend({ user: authUserSchema });

export const stopSchema = z.object({
  id: z.string().min(1),
  missionId: z.string().min(1),
  label: z.string(),
  // Pas de bornes ici : elles s'appliquent a la saisie. Refuser a la lecture
  // un arret deja en base rendrait toute la mission illisible.
  lat: z.number(),
  lon: z.number(),
  addressText: z.string(),
  informalDescription: nullableText,
  landmark: nullableText,
  contactName: nullableText,
  contactPhone: nullableText,
  timeWindowStart: nullableText,
  timeWindowEnd: nullableText,
  loadKg: z.number(),
  volumeL: z.number(),
  serviceMinutes: z.number().int(),
  priority: z.enum(['normal', 'high']),
  sequence: z.number().int().nullable(),
  estimatedArrival: isoDateTime.nullable(),
  status: z.enum(STOP_STATUSES),
  completedAt: isoDateTime.nullable(),
  failureReason: nullableText,
  updatedAt: isoDateTime,
});

export const missionSchema = z.object({
  id: z.string().min(1),
  label: nullableText,
  /** Jour de tournee, serialise a minuit UTC : `2026-11-04T00:00:00.000Z`. */
  date: isoDateTime,
  status: z.enum(MISSION_STATUSES),
  driverId: nullableText,
  vehicleId: nullableText,
  startDepotId: nullableText,
  endDepotId: nullableText,
  optimizedAt: isoDateTime.nullable(),
  estimatedDurationSeconds: z.number().int().nullable(),
  estimatedDistanceMeters: z.number().int().nullable(),
  startedAt: isoDateTime.nullable(),
  completedAt: isoDateTime.nullable(),
  updatedAt: isoDateTime,
});

export const missionSummarySchema = missionSchema
  .extend({ _count: z.object({ stops: z.number().int() }) })
  .transform(({ _count, ...mission }) => ({ ...mission, stopCount: _count.stops }));

export const missionListSchema = z.object({
  missions: z.array(missionSummarySchema),
  nextCursor: z.string().nullable(),
});

export const missionDetailSchema = missionSchema.extend({ stops: z.array(stopSchema) });

/**
 * Matrice OSRM. Une case `null` signale un couple de points qu'OSRM ne sait
 * pas relier (point hors du reseau routier) : au client de decider du repli.
 */
const matrixSchema = z.array(z.array(z.number().nullable()));
export const tableResponseSchema = z.object({
  durations: matrixSchema,
  distances: matrixSchema.optional(),
});

export const geocodeCandidateSchema = z.object({
  label: z.string(),
  lat: z.number(),
  lon: z.number(),
  source: z.enum(['photon', 'address-book']),
  city: z.string().nullable(),
  commune: z.string().nullable(),
  /** Livraisons ayant confirme ce point ; absent pour Photon. */
  confirmations: z.number().int().optional(),
});

export const geocodeSearchResponseSchema = z.object({
  candidates: z.array(geocodeCandidateSchema),
  /** false : geocodage degrade, a distinguer d'une absence de resultat. */
  photonAvailable: z.boolean(),
});

export type AuthUser = z.infer<typeof authUserSchema>;
export type TokenPair = z.infer<typeof tokenPairSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
export type Stop = z.infer<typeof stopSchema>;
export type Mission = z.infer<typeof missionSchema>;
export type MissionSummary = z.output<typeof missionSummarySchema>;
export type MissionList = z.output<typeof missionListSchema>;
export type MissionDetail = z.infer<typeof missionDetailSchema>;
export type TableResponse = z.infer<typeof tableResponseSchema>;
export type GeocodeCandidate = z.infer<typeof geocodeCandidateSchema>;
export type GeocodeSearchResponse = z.infer<typeof geocodeSearchResponseSchema>;
