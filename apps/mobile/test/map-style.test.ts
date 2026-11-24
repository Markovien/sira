import { describe, expect, it } from 'vitest';
import {
  cameraBounds,
  GLYPHS_URL,
  SPRITE_URL,
  longPressPoint,
  offlineMapStyle,
  routeLine,
  stopFeatures,
} from '../src/core/map-style';
import type { DisplayedStop } from '../src/core/mission-view';
import { stop } from './support/fixtures';

const displayed = (...stops: ReturnType<typeof stop>[]): DisplayedStop[] =>
  stops.map((s) => ({ stop: s, eta: null }));

function fontsOf(style: ReturnType<typeof offlineMapStyle>): Set<string> {
  const fonts = new Set<string>();
  const walk = (v: unknown): void => {
    if (typeof v === 'string') fonts.add(v);
    else if (Array.isArray(v)) v.forEach(walk);
  };
  for (const layer of style.layers) {
    if (layer.type === 'symbol') walk(layer.layout?.['text-font']);
  }
  return fonts;
}

describe('offlineMapStyle', () => {
  it("lit l'archive locale et les glyphes embarques, sans aucune URL reseau", () => {
    const style = offlineMapStyle('file:///data/user/0/ci.sira.app/files/maps/abidjan.pmtiles');
    const source = style.sources.protomaps;
    expect(source).toMatchObject({
      type: 'vector',
      url: 'pmtiles://file:///data/user/0/ci.sira.app/files/maps/abidjan.pmtiles',
    });
    expect(style.glyphs).toBe(GLYPHS_URL);
    expect(JSON.stringify(style)).not.toMatch(/https?:\/\//);
  });

  it("n'utilise que les polices et le sprite embarques", () => {
    const style = offlineMapStyle('file:///carte.pmtiles');
    const fonts = fontsOf(style);
    // Seuls les noms sans espace existent dans les assets Android ; les
    // fragments d'expression ("literal", "case"...) ne sont pas des polices.
    expect([...fonts].filter((f) => f.startsWith('Noto Sans'))).toEqual([]);
    // Y compris dans les expressions `format` de text-field.
    expect(JSON.stringify(style.layers)).not.toContain('Noto Sans');
    expect(fonts.has('NotoSansRegular')).toBe(true);
    expect(style.sprite).toBe(SPRITE_URL);
    // Pas de couche de commerces : seuls nos arrets doivent ressortir.
    expect(style.layers.some((l) => l.id === 'pois')).toBe(false);
  });

  it("garde un fond uni tant que l'archive n'est pas telechargee", () => {
    const style = offlineMapStyle(null);
    expect(style.sources).toEqual({});
    expect(style.layers.map((l) => l.type)).toEqual(['background']);
  });
});

describe('stopFeatures et routeLine', () => {
  const a = stop('a', 'm', { lat: 5.3, lon: -4.0 });
  const b = stop('b', 'm', { lat: 5.31, lon: -4.01, status: 'delivered' });
  const c = stop('c', 'm', { lat: 5.32, lon: -4.02 });

  it('numerote les arrets comme la liste, en [lon, lat]', () => {
    const fc = stopFeatures(displayed(a, b, c));
    expect(fc.features.map((f) => f.properties.rank)).toEqual([1, 2, 3]);
    expect(fc.features[0]?.geometry.coordinates).toEqual([-4.0, 5.3]);
    expect(fc.features[1]?.properties.pending).toBe(false);
  });

  it('ne trace que les arrets restants', () => {
    expect(routeLine(displayed(a, b, c)).features[0]?.geometry.coordinates).toEqual([
      [-4.0, 5.3],
      [-4.02, 5.32],
    ]);
    expect(routeLine(displayed(a, b)).features).toEqual([]);
  });
});

describe('cameraBounds', () => {
  it('englobe les arrets avec une marge, en [ouest, sud, est, nord]', () => {
    const [west, south, east, north] = cameraBounds([
      { lat: 5.3, lon: -4.0 },
      { lat: 5.4, lon: -3.9 },
    ]);
    expect(west).toBeLessThan(-4.0);
    expect(south).toBeLessThan(5.3);
    expect(east).toBeGreaterThan(-3.9);
    expect(north).toBeGreaterThan(5.4);
  });

  it('cadre le Grand Abidjan sans arret', () => {
    expect(cameraBounds([])).toEqual([-4.35, 5.15, -3.75, 5.55]);
  });
});

describe('longPressPoint', () => {
  it('convertit [lon, lat] en coordonnees internes', () => {
    expect(longPressPoint([-4.0, 5.3])).toEqual({ lat: 5.3, lon: -4.0 });
  });

  it("refuse un point hors de Cote d'Ivoire, comme toute saisie", () => {
    expect(longPressPoint([2.35, 48.85])).toBeNull();
    expect(longPressPoint([])).toBeNull();
  });
});
