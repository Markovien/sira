import type { Coordinates } from '@sira/shared';

/**
 * Liens « Y aller » (roadmap Phase 3.5). L'ecran les essaie dans l'ordre et
 * s'arrete au premier qui s'ouvre — voir decisions.md (25/10/2026) pour
 * l'abandon de `canOpenURL`.
 */

export const NAVIGATION_APPS = ['google', 'osmand', 'waze'] as const;
export type NavigationApp = (typeof NAVIGATION_APPS)[number];

/** Six decimales, soit ~10 cm : evite qu'un `String(1e-7)` parte en notation exponentielle. */
const fmt = (value: number): string => value.toFixed(6);

function appLink(app: NavigationApp, { lat, lon }: Coordinates): string {
  switch (app) {
    case 'google':
      // Intent Android de Google Maps : lance directement le guidage.
      return `google.navigation:q=${fmt(lat)},${fmt(lon)}`;
    case 'osmand':
      // Schema propre a OsmAnd, symetrique de celui de Google. A confirmer sur
      // appareil ; en cas d'echec, la liste retombe sur Google puis `geo:`.
      return `osmand.navigation:q=${fmt(lat)},${fmt(lon)}`;
    case 'waze':
      // `waze://` plutot que le lien https : celui-ci s'ouvrirait dans le
      // navigateur sans Waze installe, et l'echec ne serait jamais detecte.
      return `waze://?ll=${fmt(lat)},${fmt(lon)}&navigate=yes`;
  }
}

export function navigationLinks(
  destination: Coordinates,
  preferred: NavigationApp = 'google',
  label?: string,
): string[] {
  const coords = `${fmt(destination.lat)},${fmt(destination.lon)}`;
  const query = label ? `${coords}(${encodeURIComponent(label)})` : coords;
  // `geo:` en dernier : toute app de carte Android sait l'ouvrir, au pire
  // sans guidage. C'est le filet qui garantit qu'un appui fait quelque chose.
  const links = [
    appLink(preferred, destination),
    appLink('google', destination),
    `geo:${coords}?q=${query}`,
  ];
  return [...new Set(links)];
}

/** Ouvre le premier lien qui aboutit ; `open` est `Linking.openURL` en production. */
export async function openFirst(
  links: readonly string[],
  open: (url: string) => Promise<unknown>,
): Promise<string | null> {
  for (const url of links) {
    try {
      await open(url);
      return url;
    } catch {
      // App absente : on passe a la suivante.
    }
  }
  return null;
}
