import { z } from 'zod';
import { USER_ROLES } from './domain.js';
import { phoneSchema } from './schemas.js';

/**
 * Schemas d'authentification, partages par l'API, le mobile et le dashboard.
 *
 * L'identifiant de connexion est le telephone et non l'e-mail : en Cote
 * d'Ivoire le livreur a un numero mobile money, rarement une adresse e-mail
 * (cadrage §3). L'OTP SMS viendra plus tard ; pour l'instant, mot de passe.
 */

/**
 * Longueur minimale plutot qu'une regle de composition : imposer majuscules et
 * caracteres speciaux a des utilisateurs qui saisissent sur un clavier mobile
 * en plein soleil produit des mots de passe notes sur un papier. La longueur
 * est le facteur qui compte, et le cout de hachage bcrypt fait le reste.
 */
export const passwordSchema = z
  .string()
  .min(8, 'Mot de passe de 8 caracteres minimum')
  .max(128, 'Mot de passe de 128 caracteres maximum');

export const userRoleSchema = z.enum(USER_ROLES);

export const registerSchema = z.object({
  phone: phoneSchema,
  password: passwordSchema,
  fullName: z.string().min(2, 'Nom complet requis').max(120),
  /// Nom de l'organisation a creer. Un livreur independant est une
  /// organisation d'une personne : pas de cas particulier dans le modele.
  organizationName: z.string().min(2).max(120),
});

export const loginSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(1, 'Mot de passe requis'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Jeton de rafraichissement requis'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;

/** Charge utile d'un jeton d'acces. Volontairement minimale. */
export interface AccessTokenPayload {
  /// Identifiant de l'utilisateur.
  sub: string;
  organizationId: string;
  role: (typeof USER_ROLES)[number];
}
