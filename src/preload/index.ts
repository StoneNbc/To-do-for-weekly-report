import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../main/ipc/channels';
import type { DataChangedEvent } from '../shared/domain';
import type { ApiResult } from '../shared/results';
import type { ElectronAPI } from './apiTypes';

const notImplemented = <T>(feature: string): Promise<ApiResult<T>> =>
  Promise.resolve({
    ok: false,
    error: {
      code: 'NOT_IMPLEMENTED',
      message: `${feature}尚未在当前开发阶段实现`,
    },
  });

const api: ElectronAPI = {
  healthCheck: () => ipcRenderer.invoke(IPC.healthCheck),
  today: {
    get: () => notImplemented('今日任务读取'),
    add: () => notImplemented('今日任务新增'),
    toggle: () => notImplemented('今日任务状态切换'),
    edit: () => notImplemented('今日任务编辑'),
    delete: () => notImplemented('今日任务删除'),
  },
  history: {
    getDay: () => notImplemented('历史记录读取'),
    add: () => notImplemented('历史记录新增'),
    edit: () => notImplemented('历史记录编辑'),
    delete: () => notImplemented('历史记录删除'),
  },
  week: {
    get: () => notImplemented('周记读取'),
  },
  report: {
    export: () => Promise.resolve({ status: 'failed', message: '周报导出尚未在当前开发阶段实现' }),
    openLast: () => notImplemented('打开最近导出的周报'),
    revealLast: () => notImplemented('定位最近导出的周报'),
  },
  window: {
    openWeekly: () => ipcRenderer.invoke(IPC.windowOpenWeekly),
    showNote: () => ipcRenderer.invoke(IPC.windowShowNote),
  },
  app: {
    openDataFolder: () => ipcRenderer.invoke(IPC.appOpenDataFolder),
    setAlwaysOnTop: (enabled) => ipcRenderer.invoke(IPC.appSetAlwaysOnTop, enabled),
    quit: () => ipcRenderer.invoke(IPC.appQuit),
  },
  events: {
    onDataChanged: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: DataChangedEvent) => listener(payload);
      ipcRenderer.on(IPC.dataChanged, handler);
      return () => ipcRenderer.removeListener(IPC.dataChanged, handler);
    },
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);
