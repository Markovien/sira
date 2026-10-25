import { z } from 'zod';
import { MISSION_STATUSES } from './domain.js';
import { COTE_DIVOIRE_BBOX } from './geo.js';
import {
  coordinatesSchema,
  phoneSchema,
  stopStatusSchema,
  timeOfDaySchema,
} from './schemas.js';

/**
 * Schemas des missions et arrets, cote API.
 *
 * Distincts de `stopInputSchema` (schemas.ts), qui decrit le jeu de donnees de
 * reference et impose un identifiant fourni. Ici l'identifiant est attribue par
 * le serveur.
 */

export const missionStatusSchema = z.enum(MISSION_STATUSES);

/** Date de tournee au format AAAA-MM-JJ, sans heure. */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ')
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Date inexistante');

const optionalId = z.string().min(1).nullable().optional();

/**
 * Identifiant choisi par le client hors connexion, pour que le rejeu d'une
 * creation soit idempotent (decisions.md, 25/10/2026). UUID impose : un
 * identifiant devinable faciliterait les collisions volontaires.
 */
export const clientIdSchema = z.string().uuid('Identifiant client attendu au format UUID');

export const createMissionSchema = z.object({
  id: clientIdSchema.optional(),
  label: z.string().min(1).max(160).optional(),
  date: isoDateSchema,
  startDepotId: optionalId,
  endDepotId: optionalId,
  vehicleId: optionalId,
  driverId: optionalId,
});

export const updateMissionSchema = createMissionSchema
  .omit({ id: true })
  .partial()
  .extend({ status: missionStatusSchema.optional() })
  // Un PATCH vide est presque toujours une erreur d'appel : le signaler plutot
  // que de renvoyer 200 sans rien avoir fait.
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Aucun champ a modifier',
  });

export const listMissionsQuerySchema = z.object({
  date: isoDateSchema.optional(),
  status: missionStatusSchema.optional(),
  driverId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).optional(),
});

/**
 * Arret tel que cree par l'API. `informalDescription` n'est pas obligatoire au
 * niveau du schema — un import CSV depart peut ne pas en avoir — mais c'est le
 * champ qui fait la valeur du produit, et la base d'adresses le reclame des la
 * premiere livraison confirmee.
 */
export const createStopSchema = z.object({
  id: clientIdSchema.optional(),
  label: z.string().min(1).max(160),
  lat: coordinatesSchema.shape.lat,
  lon: coordinatesSchema.shape.lon,
  addressText: z.string().min(1).max(400),
  informalDescription: z.string().max(600).nullable().optional(),
  landmark: z.string().max(200).nullable().optional(),
  contactName: z.string().max(160).nullable().optional(),
  contactPhone: phoneSchema.nullable().optional(),
  timeWindowStart: timeOfDaySchema.nullable().optional(),
  timeWindowEnd: timeOfDaySchema.nullable().optional(),
  loadKg: z.coerce.number().nonnegative().max(2000).default(0),
  volumeL: z.coerce.number().nonnegative().max(20000).default(0),
  serviceMinutes: z.coerce.number().int().min(0).max(120).default(5),
  priority: z.enum(['normal', 'high']).default('normal'),
});

/**
 * Variante tolerante pour l'import de fichiers : un CSV ne contient que des
 * chaines, et un tableur ecrit volontiers « 5,3457 » ou « 5.3457 » selon la
 * locale. La conversion est admise ici, et nulle part ailleurs — le contrat de
 * l'API reste strict pour les clients JSON, qui n'ont aucune raison d'envoyer
 * une coordonnee sous forme de texte.
 */
export const importStopSchema = createStopSchema.omit({ id: true }).extend({
  lat: z.coerce.number().min(COTE_DIVOIRE_BBOX.minLat).max(COTE_DIVOIRE_BBOX.maxLat),
  lon: z.coerce.number().min(COTE_DIVOIRE_BBOX.minLon).max(COTE_DIVOIRE_BBOX.maxLon),
});

export type ImportStopInput = z.infer<typeof importStopSchema>;

export const updateStopSchema = createStopSchema
  .omit({ id: true })
  .partial()
  .extend({
    status: stopStatusSchema.optional(),
    failureReason: z.string().max(400).nullable().optional(),
    sequence: z.coerce.number().int().min(0).nullable().optional(),
    /**
     * Heure du changement de statut selon le telephone, qui seul la connait
     * quand la saisie a ete faite hors connexion. Le serveur la corrige et la
     * controle (decisions.md, 26/10/2026).
     */
    completedAt: z.string().datetime({ offset: true }).optional(),
    /** Le telephone a constate que son horloge avait recule depuis sa saisie precedente. */
    clockWentBack: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Aucun champ a modifier',
  });

export type CreateMissionInput = z.infer<typeof createMissionSchema>;
export type UpdateMissionInput = z.infer<typeof updateMissionSchema>;
export type ListMissionsQuery = z.infer<typeof listMissionsQuerySchema>;
export type CreateStopInput = z.infer<typeof createStopSchema>;
export type UpdateStopInput = z.infer<typeof updateStopSchema>;

/**
 * Une fenetre horaire est soit absente des deux cotes, soit complete et
 * coherente. Valide a part du schema de l'arret pour que le message pointe la
 * fenetre et non un champ isole.
 */
export function validateTimeWindow(stop: {
  // `| undefined` explicite : sous exactOptionalPropertyTypes, un champ absent
  // et un champ a undefined ne sont pas le meme type.
  timeWindowStart?: string | null | undefined;
  timeWindowEnd?: string | null | undefined;
}): string | null {
  const { timeWindowStart: start, timeWindowEnd: end } = stop;
  if (start == null && end == null) return null;
  if (start == null || end == null) {
    return 'Fenetre horaire incomplete : debut et fin sont requis ensemble';
  }
  if (start >= end) return 'La fenetre horaire doit se terminer apres son debut';
  return null;
}

// --- Routage -----------------------------------------------------------------

/**
 * Requetes de routage. Les points sont valides par `coordinatesSchema`, donc
 * bornes a la Cote d'Ivoire : une coordonnee hors zone est presque toujours un
 * lat/lon inverse, et mieux vaut le dire que router vers le golfe de Guinee.
 */
export const routeRequestSchema = z.object({
  points: z.array(coordinatesSchema).min(2, 'Au moins deux points sont requis'),
  /** Trace encodee pour l'affichage carte. Inutile pour un simple calcul de duree. */
  geometry: z.boolean().default(true),
});

export const tableRequestSchema = z.object({
  points: z
    .array(coordinatesSchema)
    .min(2, 'Au moins deux points sont requis')
    .max(100, 'Matrice limitee a 100 points'),
  withDistances: z.boolean().default(false),
});

export type RouteRequest = z.infer<typeof routeRequestSchema>;
export type TableRequest = z.infer<typeof tableRequestSchema>;

// --- Geocodage ---------------------------------------------------------------

export const geocodeSearchSchema = z.object({
  q: z.string().min(2, 'Au moins deux caracteres').max(200),
  limit: z.coerce.number().int().min(1).max(20).default(5),
});

export const geocodeNearbySchema = coordinatesSchema.extend({
  /** 200 m : le rayon dans lequel un livreur reconnait un lieu a vue. */
  radiusMeters: z.coerce.number().int().min(10).max(2000).default(200),
});

export type GeocodeSearchQuery = z.infer<typeof geocodeSearchSchema>;
export type GeocodeNearbyQuery = z.infer<typeof geocodeNearbySchema>;

// --- Optimisation ------------------------------------------------------------

export const optimizeRequestSchema = z.object({
  /**
   * Vehicules a utiliser. Un seul (ou aucun) route vers le TSP embarque ;
   * plusieurs declenchent le solveur VRP et scindent la mission en autant de
   * tournees. Par defaut, le vehicule deja affecte a la mission.
   */
  vehicleIds: z.array(z.string().min(1)).max(50).optional(),
  timeLimitMs: z.coerce.number().int().min(100).max(60_000).optional(),
  /** Heure de depart de la tournee, en HH:MM. Defaut : 07:00. */
  departureTime: timeOfDaySchema.optional(),
});

export type OptimizeRequest = z.infer<typeof optimizeRequestSchema>;
