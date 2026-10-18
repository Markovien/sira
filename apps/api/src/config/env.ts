import { z } from 'zod';

/**
 * Schema de l'environnement de l'API.
 *
 * Valide au demarrage et non a l'usage : une variable manquante doit faire
 * echouer le processus immediatement, pas provoquer une erreur 500 trois jours
 * plus tard sur un chemin de code rarement emprunte.
 */
/**
 * Duree au format accepte par `ms` — « 15m », « 30d ». Typee comme litteral et
 * pas comme string libre : c'est ce qu'attend jsonwebtoken, et valider le
 * format ici evite un jeton emis avec une expiration silencieusement ignoree.
 */
type DurationUnit = 'ms' | 's' | 'm' | 'h' | 'd' | 'w' | 'y';
export type Duration = `${number}${DurationUnit}`;

const durationSchema = z
  .string()
  .regex(/^\d+(ms|s|m|h|d|w|y)$/, 'Duree attendue, par exemple 15m ou 30d')
  .transform((value) => value as Duration);

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.string().url(),

  // Secrets distincts : un jeton d'acces vole ne doit pas permettre d'en
  // forger un de rafraichissement.
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: durationSchema.default('15m'),
  JWT_REFRESH_TTL: durationSchema.default('30d'),

  OSRM_URL: z.string().url().default('http://localhost:5000'),
  PHOTON_URL: z.string().url().default('http://localhost:2322'),
  VRP_SOLVER_URL: z.string().url().default('http://localhost:8000'),
  VRP_SOLVER_TIME_LIMIT_SECONDS: z.coerce.number().int().min(1).max(300).default(10),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (parsed.success) return parsed.data;

  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(racine)'} : ${issue.message}`)
    .join('\n');

  throw new Error(
    `Configuration invalide — verifier le .env (modele : .env.example) :\n${details}`,
  );
}
