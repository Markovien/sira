/**
 * Textes de l'application. Le francais est la langue de reference : son jeu de
 * cles est le contrat que toute autre langue devra remplir (decisions.md,
 * 25/10/2026). Interpolation par `{nom}`.
 */
export const fr = {
  'app.name': 'SIRA',
  'app.tagline': 'Vos tournées, dans le bon ordre.',
  'home.title': 'Missions du jour',
  'home.empty': 'Aucune mission pour aujourd’hui.',
  'route.duration': 'Durée estimée : {duration}',
  'route.distance': 'Distance : {distance}',
  'route.estimateOffline': 'Estimation hors connexion',
  'stop.goThere': 'Y aller',
  'stop.noNavigationApp': 'Aucune application de navigation n’a pu s’ouvrir.',
  'units.minutes': '{count} min',
  'units.hoursMinutes': '{hours} h {minutes}',
  'units.kilometers': '{value} km',
  'units.meters': '{value} m',
} as const;

export type MessageKey = keyof typeof fr;
export type Messages = Record<MessageKey, string>;
