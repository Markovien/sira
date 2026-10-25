import { describe, expect, it } from 'vitest';
import { ApiError, NetworkError } from '../src/core/api';
import { describeError } from '../src/core/errors';
import {
  errorText,
  formatClock,
  formatDistance,
  formatDuration,
  formatMissionDate,
  t,
} from '../src/i18n';

describe('t', () => {
  it('interpole les parametres', () => {
    expect(t('units.minutes', { count: 12 })).toBe('12 min');
  });

  it('laisse visible un parametre oublie plutot que d ecrire undefined', () => {
    expect(t('units.minutes')).toBe('{count} min');
  });
});

describe('formats', () => {
  it.each([
    [59, '1 min'],
    [42 * 60, '42 min'],
    [65 * 60, '1 h 05'],
    [3 * 3600 + 20 * 60, '3 h 20'],
  ])('%i s -> %s', (seconds, text) => {
    expect(formatDuration(seconds)).toBe(text);
  });

  it.each([
    [850, '850 m'],
    [4320, '4,3 km'],
    [12_400, '12 km'],
  ])('%i m -> %s', (meters, text) => {
    expect(formatDistance(meters)).toBe(text);
  });
});

describe('dates et erreurs', () => {
  it('ecrit la date de tournee en francais', () => {
    expect(formatMissionDate('2026-11-04T00:00:00.000Z')).toBe('mercredi 4 novembre');
  });

  it('donne l heure d Abidjan', () => {
    expect(formatClock(new Date('2026-11-04T07:05:00Z'))).toBe('07:05');
  });

  it('traduit une erreur reseau et garde le detail d un refus serveur', () => {
    expect(errorText(describeError(new NetworkError()))).toMatch(/Hors connexion/);
    expect(errorText(describeError(new ApiError(409, 'Deja livre')))).toBe('Deja livre');
  });
});
