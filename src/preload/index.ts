import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../main/ipc/channels';
import type {
  AppearancePreview,
  DataChangedEvent,
  SettingsPatch,
  SettingsSnapshot,
  NoteAppearance,
} from '../shared/domain';
import type { ElectronAPI } from './apiTypes';

// Preload 只做参数转发和事件桥接；验证、文件访问与业务规则全部留在 Main Process。
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
    openSettings: () => ipcRenderer.invoke(IPC.windowOpenSettings),
  },
  app: {
    openDataFolder: () => ipcRenderer.invoke(IPC.appOpenDataFolder),
    setAlwaysOnTop: (enabled) => ipcRenderer.invoke(IPC.appSetAlwaysOnTop, enabled),
    quit: () => ipcRenderer.invoke(IPC.appQuit),
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet),
    previewAppearance: (input: AppearancePreview) =>
      ipcRenderer.invoke(IPC.settingsPreviewAppearance, input),
    update: (input: SettingsPatch) => ipcRenderer.invoke(IPC.settingsUpdate, input),
    resetAppearance: () => ipcRenderer.invoke(IPC.settingsResetAppearance),
    openLogsFolder: () => ipcRenderer.invoke(IPC.settingsOpenLogsFolder),
    copyDataPath: () => ipcRenderer.invoke(IPC.settingsCopyDataPath),
  },
  events: {
    onDataChanged: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: DataChangedEvent) =>
        listener(payload);
      ipcRenderer.on(IPC.dataChanged, handler);
      // 暴露明确的清理函数，避免 Renderer 重新渲染后残留旧监听器。
      return () => ipcRenderer.removeListener(IPC.dataChanged, handler);
    },
    onSettingsChanged: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: SettingsSnapshot) =>
        listener(payload);
      ipcRenderer.on(IPC.settingsChanged, handler);
      return () => ipcRenderer.removeListener(IPC.settingsChanged, handler);
    },
    onAppearancePreviewed: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: NoteAppearance) =>
        listener(payload);
      ipcRenderer.on(IPC.appearancePreviewed, handler);
      return () => ipcRenderer.removeListener(IPC.appearancePreviewed, handler);
    },
  },
};

// contextIsolation 开启时，这是 Renderer 获取桌面能力的唯一入口。
contextBridge.exposeInMainWorld('electronAPI', api);
