import { describe, expect, it } from 'vitest';
import {
  loginSchema,
  normalizeIvorianPhone,
  passwordSchema,
  registerSchema,
} from '../src/auth.js';
import { phoneSchema } from '../src/schemas.js';

const valid = {
  phone: '+2250701020304',
  password: 'motdepasse',
  fullName: 'Awa Kone',
  organizationName: 'Livraisons Awa',
};

describe('registerSchema', () => {
  it('accepte une inscription complete', () => {
    expect(registerSchema.parse(valid)).toEqual(valid);
  });

  it('rejette un numero hors format ivoirien E.164', () => {
    expect(registerSchema.safeParse({ ...valid, phone: '0701020304' }).success).toBe(false);
  });

  it('rejette un mot de passe de moins de 8 caracteres', () => {
    const result = registerSchema.safeParse({ ...valid, password: 'court12' });
    expect(result.success).toBe(false);
  });
});

describe('passwordSchema', () => {
  it('accepte une phrase de passe longue sans caractere special', () => {
    // La longueur prime sur la composition : une regle exigeant majuscules et
    // symboles produit des mots de passe notes sur un papier.
    expect(passwordSchema.safeParse('mon chemin vers abidjan').success).toBe(true);
  });

  it('refuse au-dela de 128 caracteres', () => {
    expect(passwordSchema.safeParse('a'.repeat(129)).success).toBe(false);
  });
});

describe('loginSchema', () => {
  it("n'impose pas la longueur minimale a la connexion", () => {
    // Un compte cree avant un durcissement de la regle doit pouvoir se
    // connecter ; c'est l'inscription qui filtre.
    expect(loginSchema.safeParse({ phone: '+2250701020304', password: 'x' }).success).toBe(
      true,
    );
  });
});

describe('normalizeIvorianPhone', () => {
  it.each([
    ['07 01 02 03 04', '+2250701020304'],
    ['0701020304', '+2250701020304'],
    ['+225 07 01 02 03 04', '+2250701020304'],
    ['225-07-01-02-03-04', '+2250701020304'],
    ['002250701020304', '+2250701020304'],
    ['+2250701020304', '+2250701020304'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeIvorianPhone(input)).toBe(expected);
    expect(phoneSchema.safeParse(normalizeIvorianPhone(input)).success).toBe(true);
  });

  it('ne fabrique pas un numero a partir d une saisie trop courte', () => {
    // Ancien format a 8 chiffres : il faut le refuser, pas le completer.
    expect(phoneSchema.safeParse(normalizeIvorianPhone('01 02 03 04')).success).toBe(false);
  });
});
