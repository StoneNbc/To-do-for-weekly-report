import { BrowserWindow, screen, type Rectangle } from 'electron';
import path from 'node:path';
import {
  COLLAPSED_NOTE_HEIGHT,
  DEFAULT_NOTE_HEIGHT,
  DEFAULT_NOTE_WIDTH,
  EDGE_HIDE_DELAY_MS,
  EDGE_REVEAL_SIZE,
  MIN_NOTE_HEIGHT,
  MIN_NOTE_WIDTH,
  WINDOW_MOVE_SETTLE_MS,
} from '../shared/constants';
import type { AppLogger } from './logging/logger';
import type { MenuFactory } from './menuFactory';
import { restoreVisibleBounds } from './platform/displayBounds';
import {
  detectNoteDockCandidate,
  getHiddenNoteBounds,
  snapNoteToEdge,
  type NoteDisplayArea,
} from './platform/noteAutoHide';
import type { ConfigService } from './services/configService';
import type {
  DataChangedEvent,
  NoteAppearance,
  NoteDockEdge,
  NoteDockSnapshot,
  NoteInteractionState,
  SettingsSnapshot,
} from '../shared/domain';
import { IPC } from './ipc/channels';
import { SettingsCloseGuard } from './services/settingsCloseGuard';

export interface WindowManagerOptions {
  config: ConfigService;
  logger: AppLogger;
  preloadPath: string;
  rendererHtmlPath: string;
  rendererDevUrl?: string;
  appIconPath?: string;
  isQuitting: () => boolean;
}

const toDisplayAreas = (): NoteDisplayArea[] => {
  const primaryId = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((display) => ({
    id: display.id,
    workArea: display.workArea,
    primary: display.id === primaryId,
  }));
};

interface NoteDockRuntimeState extends NoteDockSnapshot {
  displayId: number | null;
  visibleBounds: Rectangle | null;
  pointerInside: boolean;
  interactionBlocked: boolean;
}

const createUndockedState = (
  interaction?: Pick<NoteDockRuntimeState, 'pointerInside' | 'interactionBlocked'>,
): NoteDockRuntimeState => ({
  edge: null,
  phase: 'undocked',
  displayId: null,
  visibleBounds: null,
  pointerInside: interaction?.pointerInside ?? false,
  interactionBlocked: interaction?.interactionBlocked ?? false,
});

const sameBounds = (left: Rectangle, right: Rectangle): boolean =>
  left.x === right.x &&
  left.y === right.y &&
  left.width === right.width &&
  left.height === right.height;

const NOTE_POINTER_POLL_MS = 50;

/**
 * 管理便利贴、周记、设置三个 BrowserWindow 的创建、显示与交互。
 * 便利贴窗口承担无边框置顶、紧凑收起、贴边自动隐藏/唤出、尺寸记忆等桌面行为；
 * 所有窗口���行在隔离沙箱中，仅通过 Preload 暴露的白名单能力与 Main 通信。
 */
export class WindowManager {
  readonly #options: WindowManagerOptions;
  #noteWindow: BrowserWindow | null = null;
  #weeklyWindow: BrowserWindow | null = null;
  #projectCreateWindow: BrowserWindow | null = null;
  #settingsWindow: BrowserWindow | null = null;
  #menuFactory: MenuFactory | null = null;
  #settingsCloseHandler: (() => void) | null = null;
  readonly #settingsCloseGuard = new SettingsCloseGuard();
  #boundsTimer: NodeJS.Timeout | null = null;
  #moveSettleTimer: NodeJS.Timeout | null = null;
  #autoHideTimer: NodeJS.Timeout | null = null;
  #programmaticBoundsTimer: NodeJS.Timeout | null = null;
  #pointerPollTimer: NodeJS.Timeout | null = null;
  #visibleOnFullScreenApplied: boolean | null = null;
  #programmaticBoundsChange = false;
  #pendingReportGeneration = false;
  #noteCollapsed = false;
  #expandedNoteBounds: Rectangle | null = null;
  #dockState = createUndockedState();
  #displayListenersRegistered = false;
  readonly #displayChangeHandler = (): void => this.#handleDisplayChange();

  constructor(options: WindowManagerOptions) {
    this.#options = options;
  }

  setMenuFactory(menuFactory: MenuFactory): void {
    this.#menuFactory = menuFactory;
  }

  setSettingsCloseHandler(handler: () => void): void {
    this.#settingsCloseHandler = handler;
  }

  setSettingsDirty(dirty: boolean): void {
    this.#settingsCloseGuard.setDirty(dirty);
  }

  discardSettingsChangesAndClose(): void {
    const window = this.#settingsWindow;
    if (!window || window.isDestroyed()) return;
    this.#settingsCloseGuard.allowDiscardOnce();
    window.close();
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
      ...(process.platform === 'darwin' ? { type: 'panel' as const } : {}),
      minWidth: MIN_NOTE_WIDTH,
      minHeight: MIN_NOTE_HEIGHT,
      title: '悬浮便利贴',
      ...(this.#options.appIconPath ? { icon: this.#options.appIconPath } : {}),
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
    this.#dockState = createUndockedState();
    this.#visibleOnFullScreenApplied = null;
    this.#applyAlwaysOnTop(config.always_on_top, config.show_on_fullscreen);
    this.#registerDisplayListeners();

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
      this.#clearDockTimers();
      this.#noteCollapsed = false;
      this.#expandedNoteBounds = null;
      this.#dockState = createUndockedState();
      this.#visibleOnFullScreenApplied = null;
    });
    noteWindow.on('will-move', () => {
      this.#handleManualNoteMove();
    });
    noteWindow.on('move', () => {
      this.#handleNoteMove(noteWindow);
      this.#scheduleBoundsSave(noteWindow);
      this.#scheduleDockDetection(noteWindow);
    });
    if (process.platform === 'win32') {
      noteWindow.on('moved', () => this.#detectAndDock(noteWindow));
    }
    noteWindow.on('resize', () => {
      this.#scheduleBoundsSave(noteWindow);
      this.#scheduleDockDetection(noteWindow);
    });
    noteWindow.webContents.on('context-menu', () => {
      this.#revealDockedNote('context-menu');
      this.#menuFactory?.createNoteContextMenu().popup({ window: noteWindow });
    });

    await this.#loadView(noteWindow, 'note');
    if (config.edge_auto_hide) this.#detectAndDock(noteWindow);
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
      ...(this.#options.appIconPath ? { icon: this.#options.appIconPath } : {}),
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
      if (!weeklyWindow.isDestroyed()) {
        weeklyWindow.show();
        this.#sendPendingReportGeneration(weeklyWindow);
      }
    });
    weeklyWindow.on('closed', () => {
      if (this.#weeklyWindow === weeklyWindow) this.#weeklyWindow = null;
    });
    await this.#loadView(weeklyWindow, 'weekly');
    return weeklyWindow;
  }

  async requestCurrentWeekReportGeneration(): Promise<void> {
    const existing = Boolean(this.#weeklyWindow && !this.#weeklyWindow.isDestroyed());
    this.#pendingReportGeneration = true;
    const window = await this.openWeekly();
    if (existing) this.#sendPendingReportGeneration(window);
  }

  async openProjectCreate(): Promise<BrowserWindow> {
    this.#revealDockedNote('show');
    this.#cancelAutoHide();
    const existing = this.#projectCreateWindow;
    if (existing && !existing.isDestroyed()) {
      if (existing.isMinimized()) existing.restore();
      existing.show();
      existing.focus();
      return existing;
    }
    const window = new BrowserWindow({
      width: 440,
      height: 340,
      minWidth: 360,
      minHeight: 300,
      title: '新建项目',
      show: false,
      ...(this.#noteWindow ? { parent: this.#noteWindow, modal: true } : {}),
      ...(this.#options.appIconPath ? { icon: this.#options.appIconPath } : {}),
      webPreferences: {
        preload: this.#options.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    this.#projectCreateWindow = window;
    window.on('ready-to-show', () => {
      if (!window.isDestroyed()) {
        window.show();
        window.focus();
      }
    });
    window.on('closed', () => {
      if (this.#projectCreateWindow === window) this.#projectCreateWindow = null;
      if (!this.#options.isQuitting()) this.showFloatingNote();
    });
    try {
      await this.#loadView(window, 'project-create');
    } catch (error) {
      window.close();
      throw error;
    }
    return window;
  }

  closeProjectCreate(): void {
    this.#projectCreateWindow?.close();
  }

  notifyProjectCreated(name: string, senderId: number): void {
    if (this.#projectCreateWindow?.webContents.id !== senderId) return;
    const note = this.#noteWindow;
    if (note && !note.isDestroyed()) note.webContents.send(IPC.projectCreated, name);
  }

  async openSettings(): Promise<BrowserWindow> {
    if (this.#settingsWindow && !this.#settingsWindow.isDestroyed()) {
      if (this.#settingsWindow.isMinimized()) this.#settingsWindow.restore();
      this.#settingsWindow.show();
      this.#settingsWindow.focus();
      return this.#settingsWindow;
    }

    const settingsWindow = new BrowserWindow({
      width: 720,
      height: 760,
      minWidth: 480,
      minHeight: 440,
      title: '设置',
      ...(this.#options.appIconPath ? { icon: this.#options.appIconPath } : {}),
      show: false,
      webPreferences: {
        preload: this.#options.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    this.#settingsWindow = settingsWindow;
    this.#settingsCloseGuard.reset();
    settingsWindow.on('ready-to-show', () => {
      if (!settingsWindow.isDestroyed()) settingsWindow.show();
    });
    settingsWindow.on('close', (event) => {
      if (this.#settingsCloseGuard.shouldPreventClose(this.#options.isQuitting())) {
        event.preventDefault();
        settingsWindow.webContents.send(IPC.settingsCloseRequested);
      }
    });
    settingsWindow.on('closed', () => {
      if (this.#settingsWindow === settingsWindow) this.#settingsWindow = null;
      this.#settingsCloseGuard.reset();
      this.#settingsCloseHandler?.();
    });
    await this.#loadView(settingsWindow, 'settings');
    return settingsWindow;
  }

  showFloatingNote(): void {
    const window = this.#noteWindow;
    if (!window || window.isDestroyed()) return;
    this.#revealDockedNote('show');
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  }

  getNoteDockState(): NoteDockSnapshot {
    return { edge: this.#dockState.edge, phase: this.#dockState.phase };
  }

  setNoteInteractionState(input: NoteInteractionState): void {
    this.#dockState.interactionBlocked = input.autoHideBlocked;
    const pointerInside = this.#readPointerInsideNote(input.pointerInside);
    this.#applyPointerInside(pointerInside);
    if (input.autoHideBlocked) this.#cancelAutoHide();
    else if (!pointerInside) this.#scheduleAutoHide();
  }

  setFloatingNoteCollapsed(collapsed: boolean): boolean {
    const window = this.#noteWindow;
    if (!window || window.isDestroyed() || collapsed === this.#noteCollapsed) {
      return this.#noteCollapsed;
    }

    if (this.#boundsTimer) {
      clearTimeout(this.#boundsTimer);
      this.#boundsTimer = null;
    }

    this.#revealDockedNote('collapse');

    const current = window.getBounds();
    const dockEdge = this.#dockState.edge;
    const dockDisplayId = this.#dockState.displayId;
    if (collapsed) {
      this.#expandedNoteBounds = current;
      this.#noteCollapsed = true;
      // 紧凑尺寸只属于当前会话；先保存完整尺寸，避免下次启动仍只有标题栏高度。
      this.#options.config.setWindowBounds(current);
      this.#applyVisibleSizePolicy(window);
      this.#setProgrammaticBounds(window, { ...current, height: COLLAPSED_NOTE_HEIGHT }, true);
      this.#reanchorDockAfterResize(window, dockEdge, dockDisplayId);
      return true;
    }

    const expanded = this.#expandedNoteBounds ?? {
      ...current,
      height: DEFAULT_NOTE_HEIGHT,
    };
    this.#noteCollapsed = false;
    this.#expandedNoteBounds = null;
    this.#applyVisibleSizePolicy(window);
    this.#setProgrammaticBounds(
      window,
      {
        x: current.x,
        y: current.y,
        width: expanded.width,
        height: Math.max(expanded.height, MIN_NOTE_HEIGHT),
      },
      true,
    );
    this.#reanchorDockAfterResize(window, dockEdge, dockDisplayId);
    return false;
  }

  toggleFloatingNote(): void {
    if (this.isFloatingNoteVisible()) this.#noteWindow?.hide();
    else this.showFloatingNote();
  }

  isFloatingNoteVisible(): boolean {
    return Boolean(
      this.#noteWindow &&
      !this.#noteWindow.isDestroyed() &&
      this.#noteWindow.isVisible() &&
      this.#dockState.phase !== 'hidden',
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
    for (const window of [this.#noteWindow, this.#weeklyWindow, this.#projectCreateWindow]) {
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
    this.#applyAlwaysOnTop(snapshot.alwaysOnTop, snapshot.showOnFullScreen);
    if (!snapshot.edgeAutoHideEnabled) {
      this.#revealDockedNote('setting');
      this.#clearDockState();
    } else if (noteWindow && !noteWindow.isDestroyed()) {
      this.#detectAndDock(noteWindow);
    }
  }

  broadcastSettingsChanged(snapshot: SettingsSnapshot): void {
    for (const window of [this.#noteWindow, this.#weeklyWindow, this.#settingsWindow]) {
      if (window && !window.isDestroyed()) window.webContents.send(IPC.settingsChanged, snapshot);
    }
  }

  setAlwaysOnTop(enabled: boolean): void {
    const config = this.#options.config.update(
      enabled ? { always_on_top: true } : { always_on_top: false, show_on_fullscreen: false },
    );
    this.#applyAlwaysOnTop(config.always_on_top, config.show_on_fullscreen);
  }

  saveCurrentBounds(): void {
    const window = this.#noteWindow;
    if (!window || window.isDestroyed() || window.isMinimized() || window.isMaximized()) return;
    if (this.#boundsTimer) {
      clearTimeout(this.#boundsTimer);
      this.#boundsTimer = null;
    }
    const current = this.#dockState.visibleBounds ?? window.getBounds();
    if (this.#noteCollapsed && this.#expandedNoteBounds) {
      this.#options.config.setWindowBounds({
        ...this.#expandedNoteBounds,
        x: current.x,
        y: current.y,
      });
      return;
    }
    this.#options.config.setWindowBounds(current);
  }

  closeAll(): void {
    this.saveCurrentBounds();
    this.#clearDockTimers();
    this.#unregisterDisplayListeners();
    this.#projectCreateWindow?.close();
    this.#weeklyWindow?.close();
    this.#settingsWindow?.close();
    this.#noteWindow?.close();
  }

  async #loadView(
    window: BrowserWindow,
    view: 'note' | 'weekly' | 'settings' | 'project-create',
  ): Promise<void> {
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

  #applyAlwaysOnTop(enabled: boolean, showOnFullScreen: boolean): void {
    const noteWindow = this.#noteWindow;
    if (!noteWindow || noteWindow.isDestroyed()) return;
    noteWindow.setAlwaysOnTop(enabled, enabled ? 'floating' : 'normal');
    const visibleOnFullScreen = enabled && showOnFullScreen;
    if (this.#visibleOnFullScreenApplied === visibleOnFullScreen) return;
    noteWindow.setVisibleOnAllWorkspaces(
      visibleOnFullScreen,
      visibleOnFullScreen ? { visibleOnFullScreen: true } : undefined,
    );
    this.#visibleOnFullScreenApplied = visibleOnFullScreen;
  }

  #sendPendingReportGeneration(window: BrowserWindow): void {
    if (!this.#pendingReportGeneration || window.isDestroyed()) return;
    this.#pendingReportGeneration = false;
    window.webContents.send(IPC.reportGenerationRequested);
  }

  #scheduleDockDetection(window: BrowserWindow): void {
    if (
      this.#programmaticBoundsChange ||
      this.#dockState.phase === 'hidden' ||
      !this.#options.config.get().edge_auto_hide
    ) {
      return;
    }
    if (this.#moveSettleTimer) clearTimeout(this.#moveSettleTimer);
    this.#moveSettleTimer = setTimeout(() => {
      this.#moveSettleTimer = null;
      this.#detectAndDock(window);
    }, WINDOW_MOVE_SETTLE_MS);
  }

  #handleManualNoteMove(): void {
    if (this.#dockState.phase === 'undocked') return;
    if (this.#programmaticBoundsTimer) clearTimeout(this.#programmaticBoundsTimer);
    this.#programmaticBoundsTimer = null;
    this.#programmaticBoundsChange = false;
    this.#clearDockState();
  }

  #handleNoteMove(window: BrowserWindow): void {
    const visibleBounds = this.#dockState.visibleBounds;
    if (
      !this.#programmaticBoundsChange &&
      this.#dockState.phase === 'docked-visible' &&
      visibleBounds &&
      !sameBounds(window.getBounds(), visibleBounds)
    ) {
      this.#clearDockState();
    }
  }

  #detectAndDock(window: BrowserWindow): void {
    if (
      window.isDestroyed() ||
      window.isMinimized() ||
      window.isMaximized() ||
      this.#programmaticBoundsChange ||
      this.#dockState.phase === 'hidden' ||
      !this.#options.config.get().edge_auto_hide
    ) {
      return;
    }

    const bounds = window.getBounds();
    const electronDisplay = screen.getDisplayMatching(bounds);
    const displays = toDisplayAreas();
    const display = displays.find((candidate) => candidate.id === electronDisplay.id);
    if (!display) {
      this.#clearDockState();
      return;
    }
    const candidate = detectNoteDockCandidate(bounds, display, displays);
    if (!candidate) {
      this.#clearDockState();
      return;
    }

    this.#cancelAutoHide();
    this.#dockState = {
      ...this.#dockState,
      edge: candidate.edge,
      phase: 'docked-visible',
      displayId: candidate.displayId,
      visibleBounds: candidate.visibleBounds,
    };
    this.#setProgrammaticBounds(window, candidate.visibleBounds);
    this.#saveVisibleBounds(candidate.visibleBounds);
    this.#broadcastDockState();
    this.#startPointerTracking();
    if (!this.#dockState.pointerInside && !this.#dockState.interactionBlocked) {
      this.#scheduleAutoHide();
    }
  }

  #scheduleAutoHide(): void {
    if (
      this.#projectCreateWindow !== null ||
      this.#dockState.phase !== 'docked-visible' ||
      this.#dockState.pointerInside ||
      this.#dockState.interactionBlocked ||
      !this.#options.config.get().edge_auto_hide
    ) {
      return;
    }
    this.#cancelAutoHide();
    this.#autoHideTimer = setTimeout(() => {
      this.#autoHideTimer = null;
      if (
        this.#projectCreateWindow === null &&
        this.#dockState.phase === 'docked-visible' &&
        !this.#dockState.pointerInside &&
        !this.#dockState.interactionBlocked &&
        this.#options.config.get().edge_auto_hide
      ) {
        this.#hideDockedNote();
      }
    }, EDGE_HIDE_DELAY_MS);
  }

  #hideDockedNote(): void {
    const window = this.#noteWindow;
    const edge = this.#dockState.edge;
    const visibleBounds = this.#dockState.visibleBounds;
    const display = toDisplayAreas().find(
      (candidate) => candidate.id === this.#dockState.displayId,
    );
    if (!window || window.isDestroyed() || !edge || !visibleBounds || !display) {
      this.#clearDockState();
      return;
    }
    if (this.#readPointerInsideNote(false)) {
      this.#applyPointerInside(true);
      return;
    }

    const hiddenBounds = getHiddenNoteBounds(
      visibleBounds,
      display.workArea,
      edge,
      EDGE_REVEAL_SIZE,
    );
    this.#dockState.phase = 'hidden';
    this.#broadcastDockState();
    window.setMinimumSize(EDGE_REVEAL_SIZE, EDGE_REVEAL_SIZE);
    window.setResizable(false);
    this.#setProgrammaticBounds(window, hiddenBounds);
    if (
      process.platform === 'darwin' &&
      this.#options.config.get().always_on_top &&
      this.#options.config.get().show_on_fullscreen
    ) {
      window.showInactive();
    } else {
      window.blur();
    }
    this.#options.logger.debug('Floating note auto-hidden', {
      edge,
      displayId: display.id,
    });
  }

  #revealDockedNote(
    reason: 'pointer' | 'show' | 'collapse' | 'setting' | 'display' | 'context-menu',
  ): void {
    this.#cancelAutoHide();
    const window = this.#noteWindow;
    const visibleBounds = this.#dockState.visibleBounds;
    if (!window || window.isDestroyed() || this.#dockState.phase !== 'hidden' || !visibleBounds) {
      return;
    }

    this.#applyVisibleSizePolicy(window);
    this.#setProgrammaticBounds(window, visibleBounds);
    this.#dockState.phase = 'docked-visible';
    this.#broadcastDockState();
    this.#options.logger.debug('Floating note auto-hide restored', {
      edge: this.#dockState.edge,
      reason,
    });
  }

  #reanchorDockAfterResize(
    window: BrowserWindow,
    edge: NoteDockEdge | null,
    displayId: number | null,
  ): void {
    if (!edge || displayId === null) return;
    const display = toDisplayAreas().find((candidate) => candidate.id === displayId);
    if (!display) {
      this.#clearDockState();
      return;
    }
    const visibleBounds = snapNoteToEdge(window.getBounds(), display.workArea, edge);
    this.#dockState = {
      ...this.#dockState,
      edge,
      phase: 'docked-visible',
      displayId,
      visibleBounds,
    };
    this.#setProgrammaticBounds(window, visibleBounds);
    this.#saveVisibleBounds(visibleBounds);
    this.#broadcastDockState();
  }

  #applyVisibleSizePolicy(window: BrowserWindow): void {
    window.setMinimumSize(
      MIN_NOTE_WIDTH,
      this.#noteCollapsed ? COLLAPSED_NOTE_HEIGHT : MIN_NOTE_HEIGHT,
    );
    window.setResizable(!this.#noteCollapsed);
  }

  #setProgrammaticBounds(window: BrowserWindow, bounds: Rectangle, animate = false): void {
    if (sameBounds(window.getBounds(), bounds)) return;
    if (this.#programmaticBoundsTimer) clearTimeout(this.#programmaticBoundsTimer);
    this.#programmaticBoundsChange = true;
    window.setBounds(bounds, animate);
    this.#programmaticBoundsTimer = setTimeout(() => {
      this.#programmaticBoundsTimer = null;
      this.#programmaticBoundsChange = false;
    }, WINDOW_MOVE_SETTLE_MS);
  }

  #saveVisibleBounds(bounds: Rectangle): void {
    if (this.#noteCollapsed && this.#expandedNoteBounds) {
      this.#expandedNoteBounds = {
        ...this.#expandedNoteBounds,
        x: bounds.x,
        y: bounds.y,
      };
      this.#options.config.setWindowBounds(this.#expandedNoteBounds);
      return;
    }
    this.#options.config.setWindowBounds(bounds);
  }

  #clearDockState(): void {
    const changed = this.#dockState.phase !== 'undocked' || this.#dockState.edge !== null;
    this.#cancelAutoHide();
    this.#stopPointerTracking();
    this.#dockState = createUndockedState(this.#dockState);
    if (changed) this.#broadcastDockState();
  }

  #broadcastDockState(): void {
    const window = this.#noteWindow;
    if (!window || window.isDestroyed()) return;
    window.webContents.send(IPC.noteDockStateChanged, this.getNoteDockState());
  }

  #cancelAutoHide(): void {
    if (!this.#autoHideTimer) return;
    clearTimeout(this.#autoHideTimer);
    this.#autoHideTimer = null;
  }

  #clearDockTimers(): void {
    this.#cancelAutoHide();
    this.#stopPointerTracking();
    if (this.#moveSettleTimer) clearTimeout(this.#moveSettleTimer);
    if (this.#programmaticBoundsTimer) clearTimeout(this.#programmaticBoundsTimer);
    this.#moveSettleTimer = null;
    this.#programmaticBoundsTimer = null;
    this.#programmaticBoundsChange = false;
  }

  #readPointerInsideNote(fallback: boolean): boolean {
    const window = this.#noteWindow;
    if (!window || window.isDestroyed()) return fallback;
    try {
      const point = screen.getCursorScreenPoint();
      const bounds = window.getBounds();
      return (
        point.x >= bounds.x &&
        point.x < bounds.x + bounds.width &&
        point.y >= bounds.y &&
        point.y < bounds.y + bounds.height
      );
    } catch {
      return fallback;
    }
  }

  #applyPointerInside(pointerInside: boolean): void {
    const pointerEntered = pointerInside && !this.#dockState.pointerInside;
    const pointerLeft = !pointerInside && this.#dockState.pointerInside;
    this.#dockState.pointerInside = pointerInside;

    if (pointerInside) {
      this.#cancelAutoHide();
      if (pointerEntered && this.#dockState.phase === 'hidden') {
        this.#revealDockedNote('pointer');
      }
      return;
    }
    if (pointerLeft && !this.#dockState.interactionBlocked) this.#scheduleAutoHide();
  }

  #startPointerTracking(): void {
    if (this.#pointerPollTimer || this.#dockState.phase === 'undocked') return;
    this.#applyPointerInside(this.#readPointerInsideNote(this.#dockState.pointerInside));
    this.#pointerPollTimer = setInterval(() => {
      if (this.#dockState.phase === 'undocked') {
        this.#stopPointerTracking();
        return;
      }
      this.#applyPointerInside(this.#readPointerInsideNote(this.#dockState.pointerInside));
    }, NOTE_POINTER_POLL_MS);
  }

  #stopPointerTracking(): void {
    if (!this.#pointerPollTimer) return;
    clearInterval(this.#pointerPollTimer);
    this.#pointerPollTimer = null;
  }

  #registerDisplayListeners(): void {
    if (this.#displayListenersRegistered) return;
    this.#displayListenersRegistered = true;
    screen.on('display-added', this.#displayChangeHandler);
    screen.on('display-removed', this.#displayChangeHandler);
    screen.on('display-metrics-changed', this.#displayChangeHandler);
  }

  #unregisterDisplayListeners(): void {
    if (!this.#displayListenersRegistered) return;
    this.#displayListenersRegistered = false;
    screen.removeListener('display-added', this.#displayChangeHandler);
    screen.removeListener('display-removed', this.#displayChangeHandler);
    screen.removeListener('display-metrics-changed', this.#displayChangeHandler);
  }

  #handleDisplayChange(): void {
    const window = this.#noteWindow;
    if (!window || window.isDestroyed()) return;
    this.#clearDockTimers();
    this.#revealDockedNote('display');
    const persisted = this.#dockState.visibleBounds ?? window.getBounds();
    const restored = restoreVisibleBounds({
      saved:
        this.#noteCollapsed && this.#expandedNoteBounds
          ? { ...this.#expandedNoteBounds, x: persisted.x, y: persisted.y }
          : persisted,
      displays: toDisplayAreas(),
      defaults: { width: DEFAULT_NOTE_WIDTH, height: DEFAULT_NOTE_HEIGHT },
      minimum: { width: MIN_NOTE_WIDTH, height: MIN_NOTE_HEIGHT },
    });
    this.#clearDockState();
    this.#saveVisibleBounds(restored);
    if (this.#noteCollapsed) {
      this.#expandedNoteBounds = restored;
      this.#setProgrammaticBounds(window, { ...restored, height: COLLAPSED_NOTE_HEIGHT });
    } else {
      this.#setProgrammaticBounds(window, restored);
    }
  }

  #scheduleBoundsSave(window: BrowserWindow): void {
    if (
      this.#noteCollapsed ||
      this.#programmaticBoundsChange ||
      this.#dockState.phase === 'hidden'
    ) {
      return;
    }
    // resize/move 会高频触发，防抖后再交给 ConfigService 持久化。
    if (this.#boundsTimer) clearTimeout(this.#boundsTimer);
    this.#boundsTimer = setTimeout(() => {
      this.#boundsTimer = null;
      if (!window.isDestroyed() && !window.isMinimized() && !window.isMaximized()) {
        const bounds = this.#dockState.visibleBounds ?? window.getBounds();
        this.#saveVisibleBounds(bounds);
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
