import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProjectSnapshot } from '../../shared/projects';
import { useElectronAPI } from './useElectronAPI';

export const EMPTY_PROJECTS: ProjectSnapshot = {
  revision: 'projects:missing',
  projects: [],
  warnings: [],
  recovery: { blocked: false, message: '', files: [] },
};

export function useProjects() {
  const api = useElectronAPI();
  const [snapshot, setSnapshot] = useState<ProjectSnapshot>(EMPTY_PROJECTS);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++sequence.current;
    try {
      const result = await api.projects.get();
      if (current !== sequence.current) return;
      if (result.ok) {
        setSnapshot(result.data);
        setError(null);
        setLoaded(true);
      } else setError(result.error.message);
    } catch {
      if (current === sequence.current) setError('无法读取项目目录，请重试');
    }
  }, [api]);
  useEffect(() => {
    void refresh();
    const unsubscribe = api.events.onDataChanged((event) => {
      if (event.scope !== 'config') void refresh();
    });
    return () => {
      // Invalidate in-flight requests on unmount; this ref is a request counter, not a DOM node.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      sequence.current++;
      unsubscribe();
    };
  }, [api, refresh]);
  return { snapshot, error, loaded, refresh, setSnapshot };
}
