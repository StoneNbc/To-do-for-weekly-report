import type { ElectronAPI } from '../../preload/apiTypes';

declare global {
  interface Window {
    /** 由 context-isolated Preload 在页面加载前注入。 */
    electronAPI: ElectronAPI;
  }
}

export {};
