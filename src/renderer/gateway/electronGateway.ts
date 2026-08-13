import type { ElectronAPI } from '../../preload/apiTypes';

export function getElectronAPI(): ElectronAPI {
  if (!window.electronAPI) {
    throw new Error('ElectronAPI 尚未注入，请通过 Electron 启动应用');
  }
  return window.electronAPI;
}
