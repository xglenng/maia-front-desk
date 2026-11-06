'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type Handler = () => Promise<void>;
type Registry = { register: (handler: Handler | null) => void };
const RefreshContext = createContext<Registry | null>(null);

/** Lets a client page own its refresh: the shared Refresh action calls this instead of remounting the page. */
export function usePageRefresh(handler: Handler) {
  const registry = useContext(RefreshContext);
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    registry?.register(() => latest.current());
    return () => registry?.register(null);
  }, [registry]);
}

export function usePageRefreshController(path: string) {
  const router = useRouter();
  const handler = useRef<Handler | null>(null);
  const running = useRef(false);
  const dirty = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [generation, setGeneration] = useState(0);
  const registry = useRef<Registry>({ register: next => { handler.current = next; } });

  useEffect(() => { dirty.current = false; }, [path]);
  useEffect(() => {
    const markDirty = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.session-bar,.mobile-nav')) return;
      dirty.current = true;
    };
    document.addEventListener('input', markDirty);
    return () => document.removeEventListener('input', markDirty);
  }, []);

  const refresh = useCallback(async () => {
    if (running.current) return;
    const owned = handler.current;
    // Pages without their own handler are remounted, which would discard unsaved form input.
    if (!owned && dirty.current && !window.confirm('Refreshing will discard unsaved changes on this page. Continue?')) return;
    running.current = true;
    setRefreshing(true);
    setError('');
    try {
      if (owned) await owned();
      router.refresh();
      if (!owned) {
        dirty.current = false;
        setGeneration(value => value + 1);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : 'Unable to refresh this page.');
    } finally {
      running.current = false;
      setRefreshing(false);
    }
  }, [router]);

  return { registry: registry.current, refresh, refreshing, error, clearError: () => setError(''), generation };
}

export { RefreshContext };
