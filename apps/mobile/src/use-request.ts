import { useCallback, useEffect, useRef, useState } from 'react';
import { describeError, type ErrorMessage } from './core/errors';

/**
 * Chargement minimal : donnee, erreur, rechargement. Sans bibliotheque de
 * cache — au lot 3, c'est SQLite qui servira les ecrans et le reseau ne fera
 * que l'alimenter.
 */
export function useRequest<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ErrorMessage | null>(null);
  const [loading, setLoading] = useState(true);
  const loadRef = useRef(load);
  loadRef.current = load;

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await loadRef.current());
    } catch (e) {
      setError(describeError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, loading, reload };
}
