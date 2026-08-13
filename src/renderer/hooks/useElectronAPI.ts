import { useContext } from 'react';
import type { ElectronAPI } from '../../preload/apiTypes';
import { ElectronAPIContext } from '../state/electronAPIContext';

export function useElectronAPI(): ElectronAPI {
  const api = useContext(ElectronAPIContext);
  if (!api) throw new Error('页面必须位于 ElectronAPIProvider 内');
  return api;
}
