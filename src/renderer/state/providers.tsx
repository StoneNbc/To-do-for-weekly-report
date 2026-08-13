import type { PropsWithChildren } from 'react';
import type { ElectronAPI } from '../../preload/apiTypes';
import { ElectronAPIContext } from './electronAPIContext';

export function ElectronAPIProvider({
  api,
  children,
}: PropsWithChildren<{ api: ElectronAPI }>) {
  return <ElectronAPIContext.Provider value={api}>{children}</ElectronAPIContext.Provider>;
}
