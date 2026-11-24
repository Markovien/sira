import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { refreshOfflineMap, type MapRefreshResult } from './core/offline-map';
import { installedMapUri, mapFiles, onUnmeteredNetwork } from './platform/map-files';
import { onReconnect } from './platform/network';
import { useSession } from './session';

/**
 * Etat de la carte hors-ligne pour les ecrans (decisions.md, 24/11/2026).
 * Verifie le manifeste a l'ouverture et au retour du reseau (quelques
 * centaines d'octets) et ne telecharge l'archive que sur Wi-Fi, ou a la
 * demande du livreur.
 */

interface OfflineMapValue {
  /** Archive installee, a passer au style ; null tant qu'il n'y en a pas. */
  readonly uri: string | null;
  readonly busy: boolean;
  readonly last: MapRefreshResult | null;
  /** Telechargement demande par le livreur, y compris sur forfait mobile. */
  readonly download: () => Promise<void>;
}

const OfflineMapContext = createContext<OfflineMapValue | null>(null);

export function OfflineMapProvider({ children }: { children: ReactNode }) {
  const { api } = useSession();
  const [uri, setUri] = useState<string | null>(() => installedMapUri());
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<MapRefreshResult | null>(null);
  const running = useRef(false);

  const refresh = useCallback(
    async (userRequested: boolean) => {
      if (running.current) return;
      running.current = true;
      setBusy(true);
      try {
        const onWifi = await onUnmeteredNetwork().catch(() => false);
        const result = await refreshOfflineMap({ api, store: mapFiles, onWifi, userRequested });
        setLast(result);
        if (result === 'updated') setUri(installedMapUri());
      } finally {
        running.current = false;
        setBusy(false);
      }
    },
    [api],
  );

  useEffect(() => {
    void refresh(false);
    return onReconnect(() => void refresh(false));
  }, [refresh]);

  const download = useCallback(() => refresh(true), [refresh]);

  return (
    <OfflineMapContext.Provider value={{ uri, busy, last, download }}>
      {children}
    </OfflineMapContext.Provider>
  );
}

export function useOfflineMap(): OfflineMapValue {
  const value = useContext(OfflineMapContext);
  if (!value) throw new Error('useOfflineMap hors de OfflineMapProvider');
  return value;
}
