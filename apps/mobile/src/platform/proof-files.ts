import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import type { ProofFiles } from '../core/proofs';

/**
 * Photos de preuve, dans le repertoire prive de l'app (decisions.md,
 * 26/10/2026) : jamais dans la galerie du telephone, jamais envoyees.
 */

/** Cote le plus long, en pixels : un bon ou une facade y restent lisibles. */
const MAX_SIDE = 800;
/** Qualite JPEG : 50 a 100 Ko par photo, contre 2 a 4 Mo a la sortie de l'appareil. */
const JPEG_QUALITY = 0.5;

function proofDirectory(): Directory {
  const directory = new Directory(Paths.document, 'proofs');
  if (!directory.exists) directory.create({ intermediates: true, idempotent: true });
  return directory;
}

export function proofPhotoUri(name: string): string {
  return new File(proofDirectory(), name).uri;
}

export const proofFiles: ProofFiles = {
  list() {
    const names = proofDirectory()
      .list()
      .filter((entry): entry is File => entry instanceof File)
      .map((file) => file.name);
    return Promise.resolve(names);
  },
  remove(name) {
    const file = new File(proofDirectory(), name);
    if (file.exists) file.delete();
    return Promise.resolve();
  },
};

/**
 * Ouvre l'appareil photo du systeme, compresse la prise et la range sous
 * `<id>.jpg`. Renvoie le nom du fichier, ou null si le livreur a renonce ou
 * refuse la permission.
 */
export async function takeProofPhoto(id: string): Promise<string | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return null;

  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], exif: false });
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;

  // Sous-echantillonnee des le decodage : l'image pleine resolution n'est
  // jamais chargee en memoire, ce qui compte sur un telephone a 2 Go de RAM.
  const image = await ImageManipulator.manipulate(asset.uri, {
    maxWidth: MAX_SIDE,
    maxHeight: MAX_SIDE,
  }).renderAsync();
  const saved = await image.saveAsync({ compress: JPEG_QUALITY, format: SaveFormat.JPEG });

  const target = new File(proofDirectory(), `${id}.jpg`);
  await new File(saved.uri).move(target);
  try {
    // La prise brute, dans le cache : inutile de la laisser au systeme.
    new File(asset.uri).delete();
  } catch {
    // Deja supprimee par l'appareil photo : rien a faire.
  }
  return target.name;
}
