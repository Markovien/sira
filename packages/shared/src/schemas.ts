import { z } from 'zod';
import { COTE_DIVOIRE_BBOX } from './geo.js';
import { STOP_STATUSES, VEHICLE_TYPES } from './domain.js';

/** Heure locale au format HH:MM (24 h). */
export const timeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Heure attendue au format HH:MM');

export const coordinatesSchema = z.object({
  lat: z.number().min(COTE_DIVOIRE_BBOX.minLat).max(COTE_DIVOIRE_BBOX.maxLat),
  lon: z.number().min(COTE_DIVOIRE_BBOX.minLon).max(COTE_DIVOIRE_BBOX.maxLon),
});

export const timeWindowSchema = z
  .object({
    start: timeOfDaySchema,
    end: timeOfDaySchema,
  })
  .refine((w) => w.start < w.end, {
    message: 'La fenetre horaire doit se terminer apres son debut',
  });

/** Numero ivoirien au format E.164 (+225 suivi de 10 chiffres depuis 2021). */
export const phoneSchema = z
  .string()
  .regex(/^\+225\d{10}$/, 'Numero attendu au format +225XXXXXXXXXX');

export const stopStatusSchema = z.enum(STOP_STATUSES);
export const vehicleTypeSchema = z.enum(VEHICLE_TYPES);

/**
 * Arret de livraison tel qu'importe ou saisi.
 * `informalDescription` porte l'adressage reel du terrain ivoirien : reperes,
 * couleur de portail, commercant voisin (cadrage §1.2).
 */
export const stopInputSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  commune: z.string().min(1),
  lat: coordinatesSchema.shape.lat,
  lon: coordinatesSchema.shape.lon,
  addressText: z.string().min(1),
  informalDescription: z.string().min(1),
  landmark: z.string().min(1).optional(),
  contactPhone: phoneSchema.optional(),
  timeWindow: timeWindowSchema.nullable().default(null),
  loadKg: z.number().nonnegative().max(2000).default(0),
  volumeL: z.number().nonnegative().max(20000).default(0),
  serviceMinutes: z.number().int().min(0).max(120).default(5),
  priority: z.enum(['normal', 'high']).default('normal'),
});

export const depotSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  commune: z.string().min(1),
  lat: coordinatesSchema.shape.lat,
  lon: coordinatesSchema.shape.lon,
  addressText: z.string().min(1),
  openFrom: timeOfDaySchema,
  openUntil: timeOfDaySchema,
});

/** Jeu de donnees de reference `data/abidjan-stops.json` (roadmap Phase 0.5). */
export const stopsDatasetSchema = z.object({
  version: z.string().min(1),
  generatedAt: z.string().min(1),
  city: z.string().min(1),
  country: z.string().length(2),
  crs: z.literal('EPSG:4326'),
  notes: z.string().optional(),
  depots: z.array(depotSchema).min(1),
  stops: z.array(stopInputSchema).min(1),
});

export type TimeWindow = z.infer<typeof timeWindowSchema>;
export type StopInput = z.infer<typeof stopInputSchema>;
export type Depot = z.infer<typeof depotSchema>;
export type StopsDataset = z.infer<typeof stopsDatasetSchema>;
