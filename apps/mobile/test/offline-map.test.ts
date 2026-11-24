import type { TileManifest } from '@sira/shared';
import { describe, expect, it } from 'vitest';
import {
  refreshOfflineMap,
  type InstalledMap,
  type MapFileStore,
} from '../src/core/offline-map';

const MANIFEST: TileManifest = {
  version: '20261124',
  file: 'abidjan.pmtiles',
  bytes: 7_194_507,
  md5: '83cfac67a665e3095b24f49ef765fd7b',
  maxZoom: 14,
  bbox: { minLat: 5.15, minLon: -4.35, maxLat: 5.55, maxLon: -3.75 },
  attribution: '\u00a9 OpenStreetMap',
};

function setup(
  options: {
    installed?: InstalledMap | null;
    received?: { bytes: number; md5: string } | 'network-error';
    manifest?: TileManifest | 'offline';
  } = {},
) {
  const calls = { downloads: [] as string[], commits: [] as InstalledMap[], discards: 0 };
  let installed = options.installed ?? null;
  const store: MapFileStore = {
    installed: () => Promise.resolve(installed),
    download: ({ url, headers }) => {
      calls.downloads.push(`${url} ${headers.Authorization ?? ''}`);
      const received = options.received ?? { bytes: MANIFEST.bytes, md5: MANIFEST.md5 };
      return received === 'network-error'
        ? Promise.reject(new Error('coupure'))
        : Promise.resolve(received);
    },
    commit: (map) => {
      calls.commits.push(map);
      installed = map;
      return Promise.resolve();
    },
    discard: () => {
      calls.discards += 1;
      return Promise.resolve();
    },
  };
  const api = {
    tileManifest: () =>
      options.manifest === 'offline'
        ? Promise.reject(new TypeError('Network request failed'))
        : Promise.resolve(options.manifest ?? MANIFEST),
    authorizedDownload: (path: string) =>
      Promise.resolve({
        url: `https://api.test${path}`,
        headers: { Authorization: 'Bearer jeton' },
      }),
  };
  return { api, store, calls };
}

describe('refreshOfflineMap', () => {
  it("telecharge, verifie et installe l'archive sur Wi-Fi", async () => {
    const { api, store, calls } = setup();
    expect(await refreshOfflineMap({ api, store, onWifi: true })).toBe('updated');
    expect(calls.downloads).toEqual(['https://api.test/tiles/abidjan.pmtiles Bearer jeton']);
    expect(calls.commits).toEqual([
      { version: MANIFEST.version, md5: MANIFEST.md5, bytes: MANIFEST.bytes },
    ]);
  });

  it("ne retelecharge rien si l'archive installee est celle du serveur", async () => {
    const { api, store, calls } = setup({
      installed: { version: MANIFEST.version, md5: MANIFEST.md5, bytes: MANIFEST.bytes },
    });
    expect(await refreshOfflineMap({ api, store, onWifi: true })).toBe('up-to-date');
    expect(calls.downloads).toEqual([]);
  });

  it('attend le Wi-Fi sur forfait mobile, sauf demande du livreur', async () => {
    const waiting = setup();
    expect(await refreshOfflineMap({ ...waiting, onWifi: false })).toBe('waiting-for-wifi');
    expect(waiting.calls.downloads).toEqual([]);

    const asked = setup();
    expect(await refreshOfflineMap({ ...asked, onWifi: false, userRequested: true })).toBe(
      'updated',
    );
  });

  it("jette une archive tronquee ou alteree et garde l'existante", async () => {
    const old = { version: '20261024', md5: 'f'.repeat(32), bytes: 7_000_000 };
    const truncated = setup({
      installed: old,
      received: { bytes: 4_000_000, md5: MANIFEST.md5 },
    });
    expect(await refreshOfflineMap({ ...truncated, onWifi: true })).toBe('corrupt');
    expect(truncated.calls.commits).toEqual([]);
    expect(truncated.calls.discards).toBe(1);

    const altered = setup({ received: { bytes: MANIFEST.bytes, md5: '0'.repeat(32) } });
    expect(await refreshOfflineMap({ ...altered, onWifi: true })).toBe('corrupt');
  });

  it('accepte un md5 natif en majuscules', async () => {
    const { api, store } = setup({
      received: { bytes: MANIFEST.bytes, md5: MANIFEST.md5.toUpperCase() },
    });
    expect(await refreshOfflineMap({ api, store, onWifi: true })).toBe('updated');
  });

  it('ne leve jamais : serveur injoignable ou telechargement coupe', async () => {
    const offline = setup({ manifest: 'offline' });
    expect(await refreshOfflineMap({ ...offline, onWifi: true })).toBe('unavailable');

    const cut = setup({ received: 'network-error' });
    expect(await refreshOfflineMap({ ...cut, onWifi: true })).toBe('unavailable');
    expect(cut.calls.discards).toBe(1);
  });
});
