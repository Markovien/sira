import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createLocalDb, type LocalDb } from './core/local-db';
import {
  createSyncEngine,
  LAST_SYNC_KEY,
  type SyncEngine,
  type SyncOutcome,
} from './core/sync';
import { purgeProofs } from './core/proofs';
import { onReconnect } from './platform/network';
import { proofFiles } from './platform/proof-files';
import { openSqliteDriver } from './platform/sqlite';
import { useSession } from './session';

/**
 * Donnees de l'app : la base locale fait foi pour les ecrans, la
 * synchronisation l'alimente (decisions.md, 25/10/2026). `revision` change a
 * chaque ecriture locale ou synchronisation : les ecrans relisent alors.
 */

export interface SyncState {
  readonly syncing: boolean;
  readonly last: SyncOutcome | null;
  readonly pending: number;
  readonly rejected: number;
  readonly lastSyncAt: string | null;
}

interface DataContextValue {
  readonly db: LocalDb;
  readonly revision: number;
  readonly syncState: SyncState;
  readonly sync: () => Promise<void>;
  /** A appeler apres une ecriture locale : rafraichit les ecrans et tente l'envoi. */
  readonly written: () => void;
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const { api } = useSession();
  const [handles, setHandles] = useState<{ db: LocalDb; engine: SyncEngine } | null>(null);
  const [revision, setRevision] = useState(0);
  const [syncState, setSyncState] = useState<SyncState>({
    syncing: false,
    last: null,
    pending: 0,
    rejected: 0,
    lastSyncAt: null,
  });
  const handlesRef = useRef(handles);
  handlesRef.current = handles;

  const refreshCounts = useCallback(async (db: LocalDb, last?: SyncOutcome) => {
    const [counts, lastSyncAt] = await Promise.all([
      db.syncCounts(),
      db.getMeta(LAST_SYNC_KEY),
    ]);
    setSyncState((previous) => ({
      ...previous,
      ...counts,
      lastSyncAt,
      ...(last ? { last } : {}),
    }));
  }, []);

  const sync = useCallback(async () => {
    const current = handlesRef.current;
    if (!current) return;
    setSyncState((previous) => ({ ...previous, syncing: true }));
    try {
      const outcome = await current.engine.sync();
      await refreshCounts(current.db, outcome);
    } finally {
      setSyncState((previous) => ({ ...previous, syncing: false }));
      setRevision((r) => r + 1);
    }
  }, [refreshCounts]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const db = createLocalDb(await openSqliteDriver());
      await db.migrate();
      await db.claimFor(userId);
      // Preuves de plus de 30 jours, et fichiers laisses par une base videe.
      await purgeProofs(db, proofFiles, new Date()).catch(() => 0);
      if (cancelled) return;
      const engine = createSyncEngine({ db, api });
      handlesRef.current = { db, engine };
      setHandles({ db, engine });
      await refreshCounts(db);
      setRevision((r) => r + 1);
      // A l'ouverture : l'app reste utilisable pendant ce temps, sur la base locale.
      void sync();
    })();
    return () => {
      cancelled = true;
    };
  }, [api, userId, refreshCounts, sync]);

  useEffect(() => onReconnect(() => void sync()), [sync]);

  const value = useMemo<DataContextValue | null>(
    () =>
      handles && {
        db: handles.db,
        revision,
        syncState,
        sync,
        written: () => {
          setRevision((r) => r + 1);
          void refreshCounts(handles.db);
          void sync();
        },
      },
    [handles, revision, syncState, sync, refreshCounts],
  );

  // Base pas encore ouverte : quelques millisecondes au demarrage.
  if (!value) return null;
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const value = useContext(DataContext);
  if (!value) throw new Error('useData hors de DataProvider');
  return value;
}

/** Lecture de la base locale, relancee a chaque revision. */
export function useLocal<T>(query: (db: LocalDb) => Promise<T>): T | undefined {
  const { db, revision } = useData();
  const [value, setValue] = useState<T>();
  const queryRef = useRef(query);
  queryRef.current = query;
  useEffect(() => {
    let current = true;
    void queryRef.current(db).then((result) => {
      if (current) setValue(result);
    });
    return () => {
      current = false;
    };
  }, [db, revision]);
  return value;
}
