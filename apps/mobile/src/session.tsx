import type { AuthUser } from '@sira/shared';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createApiClient, type ApiClient } from './core/api';
import { secureSessionStore } from './platform/secure-session-store';

/**
 * `EXPO_PUBLIC_API_URL` est inlinee a la compilation par Expo. A defaut,
 * l'adresse sous laquelle l'emulateur Android voit la machine hote.
 */
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:3000';

type SessionState =
  { status: 'loading' } | { status: 'signedOut' } | { status: 'signedIn'; user: AuthUser };

interface SessionContextValue {
  readonly state: SessionState;
  readonly api: ApiClient;
  readonly login: (phone: string, password: string) => Promise<void>;
  readonly logout: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'loading' });

  const api = useMemo(
    () =>
      createApiClient({
        baseUrl: API_URL,
        fetch: (url, init) => fetch(url, init),
        store: secureSessionStore,
        onSessionExpired: () => setState({ status: 'signedOut' }),
      }),
    [],
  );

  useEffect(() => {
    // Aucun appel reseau ici : l'app doit s'ouvrir en mode avion.
    api
      .restore()
      .then((user) => setState(user ? { status: 'signedIn', user } : { status: 'signedOut' }))
      .catch(() => setState({ status: 'signedOut' }));
  }, [api]);

  const value = useMemo<SessionContextValue>(
    () => ({
      state,
      api,
      async login(phone, password) {
        const user = await api.login(phone, password);
        setState({ status: 'signedIn', user });
      },
      async logout() {
        await api.logout();
        setState({ status: 'signedOut' });
      },
    }),
    [api, state],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession hors de SessionProvider');
  return value;
}
