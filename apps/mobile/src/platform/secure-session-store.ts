import * as SecureStore from 'expo-secure-store';
import { storedSessionSchema, type SessionStore } from '../core/api';

const KEY = 'sira.session';

/**
 * Session dans le Keystore Android (decisions.md, 25/10/2026). Une valeur
 * illisible — format d'une version precedente, stockage corrompu — vaut
 * absence de session : mieux vaut redemander la connexion que planter au
 * demarrage.
 */
export const secureSessionStore: SessionStore = {
  async load() {
    const raw = await SecureStore.getItemAsync(KEY);
    if (raw == null) return null;
    try {
      const parsed = storedSessionSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  },
  save(session) {
    return SecureStore.setItemAsync(KEY, JSON.stringify(session));
  },
  clear() {
    return SecureStore.deleteItemAsync(KEY);
  },
};
