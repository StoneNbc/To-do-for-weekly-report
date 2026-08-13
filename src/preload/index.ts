import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../main/ipc/channels';
import type { DataChangedEvent } from '../shared/domain';
import type { ApiResult } from '../shared/results';
import type { ElectronAPI } from './apiTypes';

const notImplemented = <T>(feature: string): Promise<ApiResult<T>> =>
  Promise.resolve({
    ok: false,
    error: { code: 'NOT_IMPLEMENTED', message: `${feature}尚未在当前开发阶段实现` },
  });

const api: ElectronAPI = {
  healthCheck: () => ipcRenderer.invoke(IPC.healthCheck),
  today: {
    get: () => ipcRenderer.invoke(IPC.todayGet),
    add: (content) => ipcRenderer.invoke(IPC.todayAdd, content),
    toggle: (locator) => ipcRenderer.invoke(IPC.todayToggle, locator),
    edit: (input) => ipcRenderer.invoke(IPC.todayEdit, input),
    delete: (locator) => ipcRenderer.invoke(IPC.todayDelete, locator),
  },
  history: {
    getDay: (date) => ipcRenderer.invoke(IPC.historyGetDay, date),
    add: (input) => ipcRenderer.invoke(IPC.historyAdd, input),
    edit: (input) => ipcRenderer.invoke(IPC.historyEdit, input),
    delete: (input) => ipcRenderer.invoke(IPC.historyDelete, input),
  },
  week: {
    get: (input) => ipcRenderer.invoke(IPC.weekGet, input),
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
