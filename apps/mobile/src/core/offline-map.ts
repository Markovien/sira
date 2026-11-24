import type { TileManifest } from '@sira/shared';
import type { ApiClient } from './api';

/**
 * Carte hors-ligne (decisions.md, 24/11/2026) : une archive PMTiles du Grand
 * Abidjan, telechargee une fois depuis l'API, verifiee, puis lue sur le disque
 * par MapLibre. Ce module decide *quand* telecharger et *si* l'archive recue
 * est bonne ; le stockage reel est injecte (expo-file-system en production).
 */

/** Ce que le telephone retient de l'archive installee. */
export interface InstalledMap {
  readonly version: string;
  readonly md5: string;
  readonly bytes: number;
}

export interface MapFileStore {
  /** Archive installee et verifiee, ou null. */
  installed(): Promise<InstalledMap | null>;
  /** Telecharge dans un fichier temporaire ; renvoie sa taille et son md5. */
  download(request: {
    url: string;
    headers: Record<string, string>;
  }): Promise<{ bytes: number; md5: string }>;
  /** Remplace l'archive installee par le fichier temporaire. */
  commit(map: InstalledMap): Promise<void>;
  /** Efface le fichier temporaire. */
  discard(): Promise<void>;
}

export type MapRefreshResult =
  /** L'archive installee est celle du serveur : rien n'a transite. */
  | 'up-to-date'
  | 'updated'
  /** Une mise a jour existe, mais seulement sur Wi-Fi sans demande explicite. */
  | 'waiting-for-wifi'
  /** Serveur injoignable, ou aucune carte preparee : on garde l'existante. */
  | 'unavailable'
  /** Archive recue incomplete ou alteree : jetee, l'existante est gardee. */
  | 'corrupt';

export interface MapRefreshOptions {
  readonly api: Pick<ApiClient, 'tileManifest' | 'authorizedDownload'>;
  readonly store: MapFileStore;
  /** true si le telephone est sur Wi-Fi. */
  readonly onWifi: boolean;
  /**
   * Le livreur a appuye sur "Telecharger" : il accepte de consommer ~7 Mo
   * de forfait. Sans cela, seul le Wi-Fi declenche un telechargement.
   */
  readonly userRequested?: boolean;
}

export function sameMap(installed: InstalledMap | null, manifest: TileManifest): boolean {
  return (
    installed !== null &&
    installed.version === manifest.version &&
    installed.md5 === manifest.md5
  );
}

/**
 * Met la carte a jour si le serveur en a une plus recente. Ne leve jamais :
 * une carte absente ou ancienne n'empeche pas de livrer, la liste ordonnee
 * reste l'ecran principal.
 */
export async function refreshOfflineMap(options: MapRefreshOptions): Promise<MapRefreshResult> {
  const { api, store } = options;
  let manifest: TileManifest;
  try {
    manifest = await api.tileManifest();
  } catch {
    return 'unavailable';
  }

  if (sameMap(await store.installed(), manifest)) return 'up-to-date';
  if (!options.onWifi && !options.userRequested) return 'waiting-for-wifi';

  let received: { bytes: number; md5: string };
  try {
    const request = await api.authorizedDownload(`/tiles/${encodeURIComponent(manifest.file)}`);
    received = await store.download(request);
  } catch {
    await store.discard();
    return 'unavailable';
  }

  // Un telechargement coupe donne un fichier plus court ; un proxy de
  // l'operateur peut aussi alterer le contenu. Dans les deux cas MapLibre
  // afficherait des tuiles manquantes sans rien dire : on jette.
  if (received.bytes !== manifest.bytes || received.md5.toLowerCase() !== manifest.md5) {
    await store.discard();
    return 'corrupt';
  }
  await store.commit({ version: manifest.version, md5: manifest.md5, bytes: manifest.bytes });
  return 'updated';
}

/** Taille lisible par le livreur, en megaoctets arrondis. */
export function megabytes(bytes: number): number {
  return Math.max(1, Math.round(bytes / 1_000_000));
}
