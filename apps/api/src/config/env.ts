import { z } from 'zod';

/**
 * Schema de l'environnement de l'API.
 *
 * Valide au demarrage et non a l'usage : une variable manquante doit faire
 * echouer le processus immediatement, pas provoquer une erreur 500 trois jours
 * plus tard sur un chemin de code rarement emprunte.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.string().url(),

  // Secrets distincts : un jeton d'acces vole ne doit pas permettre d'en
  // forger un de rafraichissement.
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),

  OSRM_URL: z.string().url().default('http://localhost:5000'),
  PHOTON_URL: z.string().url().default('http://localhost:2322'),
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
