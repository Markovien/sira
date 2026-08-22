import { describe, expect, it } from 'vitest';
import { phoneSchema, stopInputSchema, timeWindowSchema } from '../src/schemas.js';

const baseStop = {
  id: 'STP-999',
  label: 'Test',
  commune: 'Plateau',
  lat: 5.325,
  lon: -4.021,
  addressText: 'Avenue Chardy, Plateau',
  informalDescription: 'Portail bleu apres la station',
};

describe('stopInputSchema', () => {
  it('applique les valeurs par defaut des champs optionnels', () => {
    const parsed = stopInputSchema.parse(baseStop);
    expect(parsed.timeWindow).toBeNull();
    expect(parsed.loadKg).toBe(0);
    expect(parsed.serviceMinutes).toBe(5);
    expect(parsed.priority).toBe('normal');
  });

  it('rejette une coordonnee hors de Cote d Ivoire', () => {
    // Accra, Ghana — erreur typique d'import CSV avec lat/lon inverses.
    const result = stopInputSchema.safeParse({ ...baseStop, lat: 5.6, lon: -0.19 });
    expect(result.success).toBe(false);
  });
});

describe('timeWindowSchema', () => {
  it('accepte une fenetre coherente', () => {
    expect(timeWindowSchema.parse({ start: '08:00', end: '11:00' })).toEqual({
      start: '08:00',
      end: '11:00',
    });
  });

  it('rejette une fenetre inversee', () => {
    expect(timeWindowSchema.safeParse({ start: '15:00', end: '09:00' }).success).toBe(false);
  });

  it('rejette une heure mal formee', () => {
    expect(timeWindowSchema.safeParse({ start: '8h', end: '11:00' }).success).toBe(false);
  });
});

describe('phoneSchema', () => {
  it('accepte un numero ivoirien E.164 a 10 chiffres', () => {
    expect(phoneSchema.safeParse('+2250701020304').success).toBe(true);
  });

  it('rejette l ancien format a 8 chiffres', () => {
    expect(phoneSchema.safeParse('+22501020304').success).toBe(false);
  });
});
