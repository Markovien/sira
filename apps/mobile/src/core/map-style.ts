import type { LayerSpecification, StyleSpecification } from '@maplibre/maplibre-gl-style-spec';
import { LIGHT, layers } from '@protomaps/basemaps';
import { ABIDJAN_BBOX, coordinatesSchema, type Coordinates } from '@sira/shared';
import type { FeatureCollection, Point } from 'geojson';
import type { DisplayedStop } from './mission-view';

/**
 * Style de la carte hors-ligne (decisions.md, 24/11/2026). Tout est local :
 * tuiles lues dans l'archive PMTiles du telephone, glyphes embarques dans
 * l'APK. Aucune requete reseau a l'affichage.
 */

/** Nom de la source vectorielle, attendu par les couches de Protomaps. */
export const BASEMAP_SOURCE = 'protomaps';

/**
 * Glyphes copies dans les assets Android par `plugins/with-map-glyphs.js`.
 * Les noms de police y sont sans espace : un espace dans une URL `asset://`
 * serait encode differemment selon les versions du moteur.
 */
export const GLYPHS_URL = 'asset://glyphs/{fontstack}/{range}.pbf';

/**
 * Sprite Protomaps (MIT), embarque lui aussi : il porte les fleches de sens
 * unique, utiles a un livreur a moto. Les pictogrammes de commerces (`pois`)
 * restent exclus.
 */
export const SPRITE_URL = 'asset://sprites/light';

export const MAP_FONTS: Readonly<Record<string, string>> = {
  'Noto Sans Regular': 'NotoSansRegular',
  'Noto Sans Medium': 'NotoSansMedium',
  // Italique (noms d'eau, numeros de rue) ramene au regulier : une police de
  // moins a embarquer, pour une nuance que le livreur ne cherche pas.
  'Noto Sans Italic': 'NotoSansRegular',
  // Ecriture devanagari (hindi) : jamais rencontree a Abidjan, ramenee a la
  // police de base plutot que d'embarquer une police de plus.
  'Noto Sans Devanagari Regular v1': 'NotoSansRegular',
};

/** Police de nos propres etiquettes (numeros d'arret). */
export const LABEL_FONT = 'NotoSansMedium';

export const ATTRIBUTION = '\u00a9 OpenStreetMap';

/**
 * Renomme les polices partout dans la mise en page, y compris dans les
 * expressions `format` de `text-field`, qui portent leur propre `text-font`.
 * Un nom de police n'est jamais une donnee : le remplacement est sans risque.
 */
function renameFonts(value: unknown): unknown {
  if (typeof value === 'string') return MAP_FONTS[value] ?? value;
  if (Array.isArray(value)) return value.map(renameFonts);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, renameFonts(v)]));
  }
  return value;
}

/** Couches Protomaps, sans pictogrammes de commerces : nos arrets ont leurs marqueurs. */
function basemapLayers(): LayerSpecification[] {
  // Sans `pois`, Protomaps ne genere pas la couche des commerces : une carte
  // moins chargee en plein soleil, ou seuls nos arrets ressortent.
  const { pois: _pois, ...flavor } = LIGHT;
  return layers(BASEMAP_SOURCE, flavor, { lang: 'fr' }).map((layer) =>
    layer.type === 'symbol' && layer.layout
      ? ({ ...layer, layout: renameFonts(layer.layout) } as LayerSpecification)
      : layer,
  );
}

/**
 * Style complet. Sans archive (pas encore telechargee), un fond uni : les
 * arrets s'affichent quand meme, positionnes les uns par rapport aux autres.
 */
export function offlineMapStyle(archiveUri: string | null): StyleSpecification {
  if (archiveUri === null) {
    return {
      version: 8,
      glyphs: GLYPHS_URL,
      sources: {},
      layers: [
        { id: 'background', type: 'background', paint: { 'background-color': '#eef0f2' } },
      ],
    };
  }
  return {
    version: 8,
    glyphs: GLYPHS_URL,
    sprite: SPRITE_URL,
    sources: {
      [BASEMAP_SOURCE]: {
        type: 'vector',
        // MapLibre Native lit l'archive sur le disque : pmtiles://file:///...
        url: `pmtiles://${archiveUri}`,
        attribution: ATTRIBUTION,
      },
    },
    layers: basemapLayers(),
  };
}

export interface StopFeatureProperties {
  id: string;
  /** Rang dans l'ordre de passage affiche, a partir de 1. */
  rank: number;
  label: string;
  pending: boolean;
}

/** Arrets en GeoJSON, dans l'ordre de la liste : le numero est le meme partout. */
export function stopFeatures(
  stops: readonly DisplayedStop[],
): FeatureCollection<Point, StopFeatureProperties> {
  return {
    type: 'FeatureCollection',
    features: stops.map(({ stop }, index) => ({
      type: 'Feature',
      id: stop.id,
      // GeoJSON est en [lon, lat] : l'inversion est le bug classique.
      geometry: { type: 'Point', coordinates: [stop.lon, stop.lat] },
      properties: {
        id: stop.id,
        rank: index + 1,
        label: stop.label,
        pending: stop.status === 'pending',
      },
    })),
  };
}

/** Trace de la tournee : les arrets restants, dans l'ordre. */
export function routeLine(
  stops: readonly DisplayedStop[],
): FeatureCollection<{ type: 'LineString'; coordinates: [number, number][] }> {
  const coordinates = stops
    .filter(({ stop }) => stop.status === 'pending')
    .map(({ stop }): [number, number] => [stop.lon, stop.lat]);
  return {
    type: 'FeatureCollection',
    features:
      coordinates.length < 2
        ? []
        : [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } }],
  };
}

/** Emprise [ouest, sud, est, nord], l'ordre de MapLibre et de GeoJSON. */
export type CameraBounds = [west: number, south: number, east: number, north: number];

/** Cadre englobant les arrets ; le Grand Abidjan s'il n'y en a aucun. */
export function cameraBounds(points: readonly Coordinates[]): CameraBounds {
  if (points.length === 0) {
    return [ABIDJAN_BBOX.minLon, ABIDJAN_BBOX.minLat, ABIDJAN_BBOX.maxLon, ABIDJAN_BBOX.maxLat];
  }
  // Un seul arret donnerait un cadre nul : ~500 m de marge autour.
  const margin = 0.005;
  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  return [
    Math.min(...lons) - margin,
    Math.min(...lats) - margin,
    Math.max(...lons) + margin,
    Math.max(...lats) + margin,
  ];
}

/**
 * Point d'un appui long, ou null s'il tombe hors de Cote d'Ivoire : la meme
 * regle que pour toute saisie d'arret (`@sira/shared`).
 */
export function longPressPoint(lngLat: readonly number[]): Coordinates | null {
  const [lon, lat] = lngLat;
  const parsed = coordinatesSchema.safeParse({ lat, lon });
  return parsed.success ? parsed.data : null;
}
