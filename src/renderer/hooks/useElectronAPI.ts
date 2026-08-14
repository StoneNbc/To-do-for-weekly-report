import { useContext } from 'react';
import type { ElectronAPI } from '../../preload/apiTypes';
import { ElectronAPIContext } from '../state/electronAPIContext';

/** 统一取得跨进程 API，并在组件脱离 Provider 时尽早暴露集成错误。 */
export function useElectronAPI(): ElectronAPI {
  const api = useContext(ElectronAPIContext);
  if (!api) throw new Error('页面必须位于 ElectronAPIProvider 内');
  return api;
}
