import { useEffect } from 'react';
import type { DataChangedEvent } from '../../shared/domain';
import { useElectronAPI } from './useElectronAPI';

/** 将 Preload 的退订函数直接交给 effect cleanup，避免组件重挂载后重复刷新。 */
export function useElectronEvents(listener: (event: DataChangedEvent) => void): void {
  const api = useElectronAPI();

  useEffect(() => api.events.onDataChanged(listener), [api, listener]);
}
