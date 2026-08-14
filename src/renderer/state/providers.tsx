import type { PropsWithChildren } from 'react';
import type { ElectronAPI } from '../../preload/apiTypes';
import { ElectronAPIContext } from './electronAPIContext';

/** 依赖注入边界：生产传 Preload API，组件测试传显式 Mock。 */
export function ElectronAPIProvider({ api, children }: PropsWithChildren<{ api: ElectronAPI }>) {
  return <ElectronAPIContext.Provider value={api}>{children}</ElectronAPIContext.Provider>;
}
