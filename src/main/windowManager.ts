import { BrowserWindow, screen, type Rectangle } from 'electron';
import path from 'node:path';
import {
  DEFAULT_NOTE_HEIGHT,
  DEFAULT_NOTE_WIDTH,
  MIN_NOTE_HEIGHT,
  MIN_NOTE_WIDTH,
} from '../shared/constants';
import type { AppLogger } from './logging/logger';
import type { MenuFactory } from './menuFactory';
import { restoreVisibleBounds } from './platform/displayBounds';
import type { ConfigService } from './services/configService';
import type { DataChangedEvent, NoteAppearance, SettingsSnapshot } from '../shared/domain';
import { IPC } from './ipc/channels';

export interface WindowManagerOptions {
  config: ConfigService;
  logger: AppLogger;
  preloadPath: string;
  rendererHtmlPath: string;
  rendererDevUrl?: string;
  isQuitting: () => boolean;
}

const toDisplayAreas = (): Array<{ workArea: Rectangle; primary?: boolean }> => {
  const primaryId = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((display) => ({
    workArea: display.workArea,
    primary: display.id === primaryId,
  }));
};

export class WindowManager {
  readonly #options: WindowManagerOptions;
  #noteWindow: BrowserWindow | null = null;
  #weeklyWindow: BrowserWindow | null = null;
  #settingsWindow: BrowserWindow | null = null;
  #menuFactory: MenuFactory | null = null;
  #settingsCloseHandler: (() => void) | null = null;
  #boundsTimer: NodeJS.Timeout | null = null;

  constructor(options: WindowManagerOptions) {
    this.#options = options;
  }

  setMenuFactory(menuFactory: MenuFactory): void {
    this.#menuFactory = menuFactory;
  }

  setSettingsCloseHandler(handler: () => void): void {
    this.#settingsCloseHandler = handler;
  }

  async createFloatingNote(): Promise<BrowserWindow> {
    if (this.#noteWindow && !this.#noteWindow.isDestroyed()) return this.#noteWindow;

    const config = this.#options.config.get();
    // 屏幕变化后修正保存位置，避免窗口恢复到已拔除的显示器上。
    const bounds = restoreVisibleBounds({
      saved: config.window_bounds,
      displays: toDisplayAreas(),
      defaults: { width: DEFAULT_NOTE_WIDTH, height: DEFAULT_NOTE_HEIGHT },
      minimum: { width: MIN_NOTE_WIDTH, height: MIN_NOTE_HEIGHT },
    });

    const noteWindow = new BrowserWindow({
      ...bounds,
      minWidth: MIN_NOTE_WIDTH,
      minHeight: MIN_NOTE_HEIGHT,
      title: '悬浮便利贴',
      frame: false,
      transparent: false,
      resizable: true,
      show: false,
      alwaysOnTop: config.always_on_top,
      opacity: config.note_opacity,
      fullscreenable: false,
      webPreferences: {
        // Renderer 永远运行在隔离沙箱中，只通过 Preload 获取白名单能力。
        preload: this.#options.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    this.#noteWindow = noteWindow;
    this.#applyAlwaysOnTop(config.always_on_top);

    noteWindow.on('ready-to-show', () => {
      if (!noteWindow.isDestroyed()) noteWindow.show();
    });
    noteWindow.on('close', (event) => {
      // 用户关闭便利贴只隐藏到托盘；真正退出由 lifecycle 设置 quitting 标志。
      if (!this.#options.isQuitting()) {
        event.preventDefault();
        noteWindow.hide();
      }
    });
    noteWindow.on('closed', () => {
      if (this.#noteWindow === noteWindow) this.#noteWindow = null;
    });
    noteWindow.on('move', () => this.#scheduleBoundsSave(noteWindow));
    noteWindow.on('resize', () => this.#scheduleBoundsSave(noteWindow));
    noteWindow.webContents.on('context-menu', () =>
      this.#menuFactory?.createNoteContextMenu().popup({ window: noteWindow }),
    );

    await this.#loadView(noteWindow, 'note');
    return noteWindow;
  }

  async openWeekly(): Promise<BrowserWindow> {
    if (this.#weeklyWindow && !this.#weeklyWindow.isDestroyed()) {
      if (this.#weeklyWindow.isMinimized()) this.#weeklyWindow.restore();
      this.#weeklyWindow.show();
      this.#weeklyWindow.focus();
      return this.#weeklyWindow;
    }

    const weeklyWindow = new BrowserWindow({
      width: 900,
      height: 680,
      minWidth: 640,
      minHeight: 480,
      title: '周记',
      show: false,
      webPreferences: {
        preload: this.#options.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    this.#weeklyWindow = weeklyWindow;
    weeklyWindow.on('ready-to-show', () => {
      if (!weeklyWindow.isDestroyed()) weeklyWindow.show();
    });
    weeklyWindow.on('closed', () => {
      if (this.#weeklyWindow === weeklyWindow) this.#weeklyWindow = null;
    });
    await this.#loadView(weeklyWindow, 'weekly');
    return weeklyWindow;
  }

  async openSettings(): Promise<BrowserWindow> {
    if (this.#settingsWindow && !this.#settingsWindow.isDestroyed()) {
      if (this.#settingsWindow.isMinimized()) this.#settingsWindow.restore();
      this.#settingsWindow.show();
      this.#settingsWindow.focus();
      return this.#settingsWindow;
    }

    const settingsWindow = new BrowserWindow({
      width: 560,
      height: 640,
      minWidth: 480,
      minHeight: 440,
      title: '设置',
      show: false,
      webPreferences: {
        preload: this.#options.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    this.#settingsWindow = settingsWindow;
    settingsWindow.on('ready-to-show', () => {
      if (!settingsWindow.isDestroyed()) settingsWindow.show();
    });
    settingsWindow.on('closed', () => {
      if (this.#settingsWindow === settingsWindow) this.#settingsWindow = null;
      this.#settingsCloseHandler?.();
    });
    await this.#loadView(settingsWindow, 'settings');
    return settingsWindow;
  }

  showFloatingNote(): void {
    const window = this.#noteWindow;
    if (!window || window.isDestroyed()) return;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  }

  toggleFloatingNote(): void {
    if (this.isFloatingNoteVisible()) this.#noteWindow?.hide();
    else this.showFloatingNote();
  }

  isFloatingNoteVisible(): boolean {
    return Boolean(
      this.#noteWindow && !this.#noteWindow.isDestroyed() && this.#noteWindow.isVisible(),
    );
  }

  isAlwaysOnTop(): boolean {
    return this.#options.config.get().always_on_top;
  }

  getActiveWindow(): BrowserWindow | undefined {
    const focused = BrowserWindow.getFocusedWindow();
    if (focused && !focused.isDestroyed()) return focused;
    if (this.#weeklyWindow && !this.#weeklyWindow.isDestroyed()) return this.#weeklyWindow;
    if (this.#settingsWindow && !this.#settingsWindow.isDestroyed()) return this.#settingsWindow;
    if (this.#noteWindow && !this.#noteWindow.isDestroyed()) return this.#noteWindow;
    return undefined;
  }

  broadcastDataChanged(event: DataChangedEvent): void {
    // 事件只声明哪些数据失效，不携带业务正文；各窗口自行重新拉取权威快照。
    for (const window of [this.#noteWindow, this.#weeklyWindow]) {
      if (window && !window.isDestroyed()) window.webContents.send(IPC.dataChanged, event);
    }
  }

  previewAppearance(appearance: NoteAppearance): void {
    const noteWindow = this.#noteWindow;
    if (!noteWindow || noteWindow.isDestroyed()) return;
    noteWindow.setOpacity(appearance.noteOpacity);
    noteWindow.webContents.send(IPC.appearancePreviewed, appearance);
  }

  applySettings(snapshot: SettingsSnapshot): void {
    const noteWindow = this.#noteWindow;
    if (noteWindow && !noteWindow.isDestroyed()) noteWindow.setOpacity(snapshot.noteOpacity);
    this.#applyAlwaysOnTop(snapshot.alwaysOnTop);
  }

  broadcastSettingsChanged(snapshot: SettingsSnapshot): void {
    for (const window of [this.#noteWindow, this.#weeklyWindow, this.#settingsWindow]) {
      if (window && !window.isDestroyed()) window.webContents.send(IPC.settingsChanged, snapshot);
    }
  }

  setAlwaysOnTop(enabled: boolean): void {
    this.#options.config.update({ always_on_top: enabled });
    this.#applyAlwaysOnTop(enabled);
  }

  saveCurrentBounds(): void {
    const window = this.#noteWindow;
    if (!window || window.isDestroyed() || window.isMinimized() || window.isMaximized()) return;
    if (this.#boundsTimer) {
      clearTimeout(this.#boundsTimer);
      this.#boundsTimer = null;
    }
    this.#options.config.setWindowBounds(window.getBounds());
  }

  closeAll(): void {
    this.saveCurrentBounds();
    this.#weeklyWindow?.close();
    this.#settingsWindow?.close();
    this.#noteWindow?.close();
  }

  async #loadView(window: BrowserWindow, view: 'note' | 'weekly' | 'settings'): Promise<void> {
    try {
      // 禁止页面自行打开新窗口或导航到非应用 origin，缩小恶意内容的攻击面。
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      window.webContents.on('will-navigate', (event, targetUrl) => {
        const allowedOrigin = this.#options.rendererDevUrl
          ? new URL(this.#options.rendererDevUrl).origin
          : 'file://';
        if (
          allowedOrigin === 'file://'
            ? !targetUrl.startsWith('file://')
            : new URL(targetUrl).origin !== allowedOrigin
        ) {
          event.preventDefault();
          this.#options.logger.warn('Blocked renderer navigation', { view, targetUrl });
        }
      });
      if (this.#options.rendererDevUrl) {
        const url = new URL(this.#options.rendererDevUrl);
        url.searchParams.set('view', view);
        await window.loadURL(url.toString());
      } else {
        await window.loadFile(this.#options.rendererHtmlPath, { query: { view } });
      }
    } catch (error) {
      this.#options.logger.error('Renderer view failed to load', { view, error });
      throw error;
    }
  }

  #applyAlwaysOnTop(enabled: boolean): void {
    const noteWindow = this.#noteWindow;
    if (!noteWindow || noteWindow.isDestroyed()) return;
    noteWindow.setAlwaysOnTop(enabled, enabled ? 'floating' : 'normal');
    noteWindow.setVisibleOnAllWorkspaces(false);
  }

  #scheduleBoundsSave(window: BrowserWindow): void {
    // resize/move 会高频触发，防抖后再交给 ConfigService 持久化。
    if (this.#boundsTimer) clearTimeout(this.#boundsTimer);
    this.#boundsTimer = setTimeout(() => {
      this.#boundsTimer = null;
      if (!window.isDestroyed() && !window.isMinimized() && !window.isMaximized()) {
        this.#options.config.setWindowBounds(window.getBounds());
      }
    }, 500);
  }
}

export const getDefaultWindowPaths = (
  dirname: string,
): { preloadPath: string; rendererHtmlPath: string } => ({
  preloadPath: path.join(dirname, '../preload/index.cjs'),
  rendererHtmlPath: path.join(dirname, '../../dist/index.html'),
});
