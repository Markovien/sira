import { describe, expect, it } from 'vitest';
import { parseDeviceTime, resolveCompletionTime } from '../src/missions/completion-time';

const SERVER_NOW = new Date('2026-11-04T15:00:00Z');
const DAY_START = new Date('2026-11-04T00:00:00Z');
const at = (iso: string) => new Date(iso);
const minutes = (n: number) => n * 60_000;

describe('resolveCompletionTime', () => {
  it('prend l heure du serveur sans heure declaree', () => {
    expect(resolveCompletionTime({ serverNow: SERVER_NOW, notBefore: DAY_START })).toEqual({
      completedAt: SERVER_NOW,
      timeSuspect: false,
    });
  });

  it('garde l heure d une livraison hors connexion envoyee plus tard', () => {
    // Livree a 10h, synchronisee a 15h, telephone a l'heure.
    const result = resolveCompletionTime({
      reportedAt: at('2026-11-04T10:00:00Z'),
      deviceNow: SERVER_NOW,
      serverNow: SERVER_NOW,
      notBefore: DAY_START,
    });
    expect(result).toEqual({ completedAt: at('2026-11-04T10:00:00Z'), timeSuspect: false });
  });

  it('corrige une horloge qui avance, et signale un ecart de plus de 5 min', () => {
    // Telephone en avance de 2 h : il croit avoir livre a 12h, il etait 10h.
    const result = resolveCompletionTime({
      reportedAt: at('2026-11-04T12:00:00Z'),
      deviceNow: at('2026-11-04T17:00:00Z'),
      serverNow: SERVER_NOW,
      notBefore: DAY_START,
    });
    expect(result).toEqual({ completedAt: at('2026-11-04T10:00:00Z'), timeSuspect: true });
  });

  it('tolere une petite derive sans rien signaler', () => {
    const result = resolveCompletionTime({
      reportedAt: at('2026-11-04T10:01:00Z'),
      deviceNow: new Date(SERVER_NOW.getTime() + minutes(1)),
      serverNow: SERVER_NOW,
      notBefore: DAY_START,
    });
    expect(result).toEqual({ completedAt: at('2026-11-04T10:00:00Z'), timeSuspect: false });
  });

  it('ramene au present une livraison datee du futur', () => {
    const result = resolveCompletionTime({
      reportedAt: at('2026-11-04T18:00:00Z'),
      serverNow: SERVER_NOW,
      notBefore: DAY_START,
    });
    expect(result).toEqual({ completedAt: SERVER_NOW, timeSuspect: true });
  });

  it('ramene au debut de la tournee une livraison datee de la veille', () => {
    const result = resolveCompletionTime({
      reportedAt: at('2026-11-03T22:00:00Z'),
      deviceNow: SERVER_NOW,
      serverNow: SERVER_NOW,
      notBefore: DAY_START,
    });
    expect(result).toEqual({ completedAt: DAY_START, timeSuspect: true });
  });

  it('signale une horloge reculee entre deux saisies', () => {
    const result = resolveCompletionTime({
      reportedAt: at('2026-11-04T09:00:00Z'),
      deviceNow: SERVER_NOW,
      serverNow: SERVER_NOW,
      notBefore: DAY_START,
      clockWentBack: true,
    });
    expect(result.timeSuspect).toBe(true);
    expect(result.completedAt).toEqual(at('2026-11-04T09:00:00Z'));
  });
});

describe('parseDeviceTime', () => {
  it('ignore un en-tete absent ou illisible', () => {
    expect(parseDeviceTime(undefined)).toBeUndefined();
    expect(parseDeviceTime('hier')).toBeUndefined();
    expect(parseDeviceTime('2026-11-04T15:00:00.000Z')).toEqual(SERVER_NOW);
  });
});
