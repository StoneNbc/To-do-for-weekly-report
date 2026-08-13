import { useCallback, useRef } from 'react';

/**
 * Coalesces watcher bursts into at most one in-flight request and one trailing request.
 * Electron file replacement can produce add/change events for the same logical write.
 */
export function useRefreshQueue(refresh: () => Promise<void>): () => void {
  const refreshRef = useRef(refresh);
  const inFlightRef = useRef(false);
  const trailingRef = useRef(false);
  refreshRef.current = refresh;

  return useCallback(() => {
    const run = async () => {
      if (inFlightRef.current) {
        trailingRef.current = true;
        return;
      }

      inFlightRef.current = true;
      try {
        await refreshRef.current();
      } finally {
        inFlightRef.current = false;
        if (trailingRef.current) {
          trailingRef.current = false;
          void run();
        }
      }
    };

    void run();
  }, []);
}
