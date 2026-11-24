import { Directory, File, Paths } from 'expo-file-system';
import * as Network from 'expo-network';
import type { InstalledMap, MapFileStore } from '../core/offline-map';

/**
 * Archive de la carte dans le repertoire prive de l'app (decisions.md,
 * 24/11/2026). Le fichier `map.json` n'est ecrit qu'apres verification de
 * l'archive : sa presence vaut installation reussie.
 */

const ARCHIVE = 'abidjan.pmtiles';
const PARTIAL = 'abidjan.pmtiles.part';
const META = 'map.json';

function mapDirectory(): Directory {
  const directory = new Directory(Paths.document, 'maps');
  if (!directory.exists) directory.create({ intermediates: true, idempotent: true });
  return directory;
}

function readMeta(): InstalledMap | null {
  const meta = new File(mapDirectory(), META);
  const archive = new File(mapDirectory(), ARCHIVE);
  if (!meta.exists || !archive.exists) return null;
  try {
    const parsed = JSON.parse(meta.textSync()) as Partial<InstalledMap>;
    if (
      typeof parsed.version !== 'string' ||
      typeof parsed.md5 !== 'string' ||
      typeof parsed.bytes !== 'number'
    ) {
      return null;
    }
    // Une archive dont la taille a change depuis l'installation n'est plus fiable.
    return archive.size === parsed.bytes
      ? { version: parsed.version, md5: parsed.md5, bytes: parsed.bytes }
      : null;
  } catch {
    return null;
  }
}

/** URI de l'archive installee, a passer au style ; null si aucune. */
export function installedMapUri(): string | null {
  return readMeta() ? new File(mapDirectory(), ARCHIVE).uri : null;
}

export const mapFiles: MapFileStore = {
  installed: () => Promise.resolve(readMeta()),

  async download({ url, headers }) {
    const partial = new File(mapDirectory(), PARTIAL);
    if (partial.exists) partial.delete();
    const file = await File.downloadFileAsync(url, partial, { headers, idempotent: true });
    // Empreinte calculee nativement : les 7 Mo ne passent jamais par le JS.
    return { bytes: file.size, md5: await file.digest('MD5') };
  },

  commit(map) {
    const directory = mapDirectory();
    const archive = new File(directory, ARCHIVE);
    // L'ancienne description d'abord : une coupure entre deux etapes laisse
    // "pas de carte", jamais "une carte annoncee mais differente".
    const meta = new File(directory, META);
    if (meta.exists) meta.delete();
    if (archive.exists) archive.delete();
    new File(directory, PARTIAL).moveSync(archive);
    meta.create({ overwrite: true });
    meta.writeSync(JSON.stringify(map));
    return Promise.resolve();
  },

  discard() {
    const partial = new File(mapDirectory(), PARTIAL);
    if (partial.exists) partial.delete();
    return Promise.resolve();
  },
};

/** Wi-Fi ou Ethernet : un telechargement de quelques Mo n'y coute rien au livreur. */
export async function onUnmeteredNetwork(): Promise<boolean> {
  const state = await Network.getNetworkStateAsync();
  return (
    state.isConnected === true &&
    (state.type === Network.NetworkStateType.WIFI ||
      state.type === Network.NetworkStateType.ETHERNET)
  );
}
