import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../main/ipc/channels';
import type { DataChangedEvent } from '../shared/domain';
import type { ElectronAPI } from './apiTypes';

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
    export: (input) => ipcRenderer.invoke(IPC.reportExport, input),
    openLast: () => ipcRenderer.invoke(IPC.reportOpenLast),
    revealLast: () => ipcRenderer.invoke(IPC.reportRevealLast),
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
