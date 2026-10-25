import * as Location from 'expo-location';
import type { Coordinates } from '@sira/shared';

/**
 * Une lecture ponctuelle, a la demande (decisions.md, 25/10/2026). Precision
 * « equilibree » : quelques dizaines de metres suffisent a choisir un ordre
 * de passage, et le GPS haute precision est le poste le plus couteux en
 * batterie. `null` si la permission est refusee ou la position introuvable.
 */
export async function currentPosition(): Promise<Coordinates | null> {
  try {
    const { granted } = await Location.requestForegroundPermissionsAsync();
    if (!granted) return null;
    const { coords } = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return { lat: coords.latitude, lon: coords.longitude };
  } catch {
    return null;
  }
}
