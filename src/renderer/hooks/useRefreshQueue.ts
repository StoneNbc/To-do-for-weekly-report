import { useCallback, useRef } from 'react';

/**
 * 将 Watcher 事件风暴合并为至多一个执行中刷新和一个尾随刷新。
 * Electron 原子替换同一个逻辑写入时，可能同时观察到 add/change 等多个事件。
 */
export function useRefreshQueue(refresh: () => Promise<void>): () => void {
  const refreshRef = useRef(refresh);
  const inFlightRef = useRef(false);
  const trailingRef = useRef(false);
  refreshRef.current = refresh;

  return useCallback(() => {
    const run = async () => {
      if (inFlightRef.current) {
        // boolean 足够表达“执行完后至少再刷新一次”，无需积累可能过时的请求。
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
