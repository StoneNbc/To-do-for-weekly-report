import { useEffect } from 'react';
import type { DataChangedEvent } from '../../shared/domain';
import { useElectronAPI } from './useElectronAPI';

export function useElectronEvents(listener: (event: DataChangedEvent) => void): void {
  const api = useElectronAPI();

  useEffect(() => api.events.onDataChanged(listener), [api, listener]);
}
