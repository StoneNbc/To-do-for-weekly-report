import type { ElectronAPI } from '../../preload/apiTypes';

/** 生产环境只接受 Preload 注入；测试通过 Provider 显式传入 Mock。 */
export function getElectronAPI(): ElectronAPI {
  if (!window.electronAPI) {
    throw new Error('ElectronAPI 尚未注入，请通过 Electron 启动应用');
  }
  return window.electronAPI;
}
