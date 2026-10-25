import type { ErrorMessage } from '../core/errors';
import { fr, type MessageKey, type Messages } from './fr';

export type { MessageKey, Messages };

// Une seule langue pour le pilote. Le jour ou une autre arrive, ce module
// choisira le dictionnaire ; les appelants n'auront pas a changer.
const messages: Messages = fr;

export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
  return messages[key].replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/** « 1 h 05 » ou « 42 min » : un livreur lit une duree, pas des secondes. */
export function formatDuration(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 60) return t('units.minutes', { count: totalMinutes });
  const hours = Math.floor(totalMinutes / 60);
  const minutes = String(totalMinutes % 60).padStart(2, '0');
  return t('units.hoursMinutes', { hours, minutes });
}

/** Virgule decimale, a la francaise : « 12,4 km ». */
export function formatDistance(meters: number): string {
  if (meters < 1000) return t('units.meters', { value: Math.round(meters) });
  const km = (meters / 1000).toFixed(meters < 10_000 ? 1 : 0).replace('.', ',');
  return t('units.kilometers', { value: km });
}

export function errorText(message: ErrorMessage): string {
  return message.key === 'error.server'
    ? t(message.key, { detail: message.detail })
    : t(message.key);
}

/** « 14:05 » a l'heure d'Abidjan, qui est l'heure UTC (pas d'heure d'ete). */
export function formatClock(date: Date): string {
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** « mardi 4 novembre », depuis la date de tournee serialisee a minuit UTC. */
export function formatMissionDate(iso: string): string {
  const date = new Date(iso);
  return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

// Ecrits en dur plutot que via Intl : Hermes n'embarque pas toujours les
// donnees de locale, et `toLocaleDateString('fr-FR')` y retombe sur l'anglais.
const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MONTHS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];
