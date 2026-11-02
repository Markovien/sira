import * as Location from 'expo-location';
import type { Coordinates } from '@sira/shared';
import type { PositionSource } from '../core/position-sampler';

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

/**
 * Echantillonnage de tournee (decisions.md, 02/11/2026) : au plus une
 * position toutes les 30 s et tous les 50 m, au premier plan seulement.
 */
export const tourPositionSource: PositionSource = {
  async watch(onPosition) {
    try {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (!granted) return null;
      const subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 30_000, distanceInterval: 50 },
        ({ coords }) => onPosition({ lat: coords.latitude, lon: coords.longitude }),
      );
      return () => subscription.remove();
    } catch {
      return null;
    }
  },
};
