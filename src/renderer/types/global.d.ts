import type { ElectronAPI } from '../../preload/apiTypes';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
