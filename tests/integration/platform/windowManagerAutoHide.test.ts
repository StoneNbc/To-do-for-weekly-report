import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppLogger } from '../../../src/main/logging/logger';
import type { ConfigService } from '../../../src/main/services/configService';
import { DEFAULT_CONFIG } from '../../../src/shared/constants';
import type { AppConfig } from '../../../src/shared/domain';

const electronMocks = vi.hoisted(() => {
  type Listener = (...args: unknown[]) => void;

  class MockEmitter {
    readonly listeners = new Map<string, Set<Listener>>();

    on(event: string, listener: Listener): this {
      const listeners = this.listeners.get(event) ?? new Set<Listener>();
      listeners.add(listener);
      this.listeners.set(event, listeners);
      return this;
    }

    removeListener(event: string, listener: Listener): this {
      this.listeners.get(event)?.delete(listener);
      return this;
    }

    emit(event: string, ...args: unknown[]): void {
      this.listeners.get(event)?.forEach((listener) => listener(...args));
    }
  }

  let nextContentsId = 1;
  class MockWebContents extends MockEmitter {
    readonly id = nextContentsId++;
    readonly sent: Array<{ channel: string; payload: unknown }> = [];

    setWindowOpenHandler(): void {}

    send(channel: string, payload: unknown): void {
      this.sent.push({ channel, payload });
    }
  }

  class MockBrowserWindow extends MockEmitter {
    static focused: MockBrowserWindow | null = null;
    static readonly instances: MockBrowserWindow[] = [];
    readonly webContents = new MockWebContents();
    bounds: { x: number; y: number; width: number; height: number };
    minimumSize = { width: 0, height: 0 };
    resizable = true;
    visible = false;
    minimized = false;
    destroyed = false;
    readonly alwaysOnTopCalls: unknown[][] = [];
    readonly visibleOnAllWorkspacesCalls: unknown[][] = [];
    showCalls = 0;

    constructor(options: unknown) {
      super();
      const bounds = options as { x: number; y: number; width: number; height: number };
      this.bounds = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
      MockBrowserWindow.instances.push(this);
    }

    static getFocusedWindow(): MockBrowserWindow | null {
      return MockBrowserWindow.focused;
    }

    getBounds() {
      return { ...this.bounds };
    }

    setBounds(bounds: Partial<typeof this.bounds>): void {
      const previous = this.bounds;
      this.bounds = { ...this.bounds, ...bounds };
      if (previous.x !== this.bounds.x || previous.y !== this.bounds.y) this.emit('move');
      if (previous.width !== this.bounds.width || previous.height !== this.bounds.height) {
        this.emit('resize');
      }
    }

    simulateManualMove(bounds: Partial<typeof this.bounds>): void {
      this.emit('will-move', {}, { ...this.bounds, ...bounds });
      this.bounds = { ...this.bounds, ...bounds };
      this.emit('move');
    }

    setMinimumSize(width: number, height: number): void {
      this.minimumSize = { width, height };
    }

    setResizable(resizable: boolean): void {
      this.resizable = resizable;
    }

    setAlwaysOnTop(...args: unknown[]): void {
      this.alwaysOnTopCalls.push(args);
    }
    setVisibleOnAllWorkspaces(...args: unknown[]): void {
      this.visibleOnAllWorkspacesCalls.push(args);
    }
    setOpacity(): void {}
    isMinimized(): boolean {
      return this.minimized;
    }
    isMaximized(): boolean {
      return false;
    }
    isDestroyed(): boolean {
      return this.destroyed;
    }
    isVisible(): boolean {
      return this.visible;
    }
    restore(): void {}
    show(): void {
      this.showCalls += 1;
      this.visible = true;
    }
    hide(): void {
      this.visible = false;
    }
    focus(): void {
      MockBrowserWindow.focused = this;
    }
    showInactive(): void {
      this.visible = true;
    }
    blur(): void {
      if (MockBrowserWindow.focused === this) MockBrowserWindow.focused = null;
    }
    close(): void {
      const event = { preventDefault: () => this.hide() };
      this.emit('close', event);
    }
    async loadFile(): Promise<void> {}
    async loadURL(): Promise<void> {}
  }

  const defaultDisplay = { id: 1, workArea: { x: 0, y: 24, width: 1_440, height: 876 } };
  let displays = [defaultDisplay];
  let primaryDisplayId = defaultDisplay.id;
  let cursorPoint = { x: -1_000, y: -1_000 };
  const screen = Object.assign(new MockEmitter(), {
    getPrimaryDisplay: () => displays.find(({ id }) => id === primaryDisplayId) ?? displays[0],
    getAllDisplays: () => displays,
    getDisplayMatching: () => displays[0],
    getCursorScreenPoint: () => ({ ...cursorPoint }),
  });

  return {
    MockBrowserWindow,
    screen,
    setCursorPoint: (point: { x: number; y: number }) => {
      cursorPoint = point;
    },
    resetDisplays: () => {
      displays = [defaultDisplay];
      primaryDisplayId = defaultDisplay.id;
    },
    setDisplays: (
      nextDisplays: Array<{
        id: number;
        workArea: { x: number; y: number; width: number; height: number };
      }>,
      nextPrimaryId?: number,
    ) => {
      displays = nextDisplays;
      primaryDisplayId = nextPrimaryId ?? nextDisplays[0]?.id ?? defaultDisplay.id;
    },
  };
});

vi.mock('electron', () => ({
  BrowserWindow: electronMocks.MockBrowserWindow,
  screen: electronMocks.screen,
}));

import { WindowManager } from '../../../src/main/windowManager';

const makeLogger = (): AppLogger => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  flush: vi.fn(async () => undefined),
});

const makeConfig = (
  windowBounds: AppConfig['window_bounds'] = { x: 0, y: 100, width: 320, height: 400 },
) => {
  let value: AppConfig = {
    ...structuredClone(DEFAULT_CONFIG),
    edge_auto_hide: true,
    window_bounds: windowBounds,
  };
  return {
    get: () => structuredClone(value),
    setWindowBounds: (bounds: AppConfig['window_bounds']) => {
      value = { ...value, window_bounds: bounds };
      return structuredClone(value);
    },
    update: (patch: Partial<AppConfig>) => {
      value = { ...value, ...patch };
      return structuredClone(value);
    },
    snapshot: () => structuredClone(value),
  };
};

beforeEach(() => {
  vi.useFakeTimers();
  electronMocks.MockBrowserWindow.instances.length = 0;
  electronMocks.MockBrowserWindow.focused = null;
  electronMocks.setCursorPoint({ x: -1_000, y: -1_000 });
  electronMocks.resetDisplays();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('WindowManager note auto-hide', () => {
  it('hides a docked note after the delay and restores it when the pointer returns', async () => {
    const config = makeConfig();
    const manager = new WindowManager({
      config: config as unknown as ConfigService,
      logger: makeLogger(),
      preloadPath: '/preload.cjs',
      rendererHtmlPath: '/index.html',
      isQuitting: () => false,
    });

    const window = (await manager.createFloatingNote()) as unknown as InstanceType<
      typeof electronMocks.MockBrowserWindow
    >;
    expect(manager.getNoteDockState()).toEqual({ edge: 'left', phase: 'docked-visible' });

    await vi.advanceTimersByTimeAsync(500);
    expect(manager.getNoteDockState()).toEqual({ edge: 'left', phase: 'hidden' });
    expect(window.getBounds()).toEqual({ x: 0, y: 100, width: 2, height: 400 });
    expect(window.minimumSize).toEqual({ width: 2, height: 2 });
    expect(window.resizable).toBe(false);
    expect(config.snapshot().window_bounds).toEqual({ x: 0, y: 100, width: 320, height: 400 });

    electronMocks.setCursorPoint({ x: 1, y: 110 });
    manager.setNoteInteractionState({ pointerInside: true, autoHideBlocked: false });
    expect(manager.getNoteDockState()).toEqual({ edge: 'left', phase: 'docked-visible' });
    expect(window.getBounds()).toEqual({ x: 0, y: 100, width: 320, height: 400 });
    expect(window.minimumSize).toEqual({ width: 280, height: 280 });
    expect(window.resizable).toBe(true);
    manager.closeAll();
  });

  it('does not hide while an interaction is blocking auto-hide', async () => {
    const config = makeConfig();
    const manager = new WindowManager({
      config: config as unknown as ConfigService,
      logger: makeLogger(),
      preloadPath: '/preload.cjs',
      rendererHtmlPath: '/index.html',
      isQuitting: () => false,
    });

    await manager.createFloatingNote();
    manager.setNoteInteractionState({ pointerInside: false, autoHideBlocked: true });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(manager.getNoteDockState().phase).toBe('docked-visible');

    manager.setNoteInteractionState({ pointerInside: false, autoHideBlocked: false });
    await vi.advanceTimersByTimeAsync(500);
    expect(manager.getNoteDockState().phase).toBe('hidden');
    manager.closeAll();
  });

  it('keeps a hidden note hidden when an unrelated display is connected', async () => {
    const config = makeConfig();
    const manager = new WindowManager({
      config: config as unknown as ConfigService,
      logger: makeLogger(),
      preloadPath: '/preload.cjs',
      rendererHtmlPath: '/index.html',
      isQuitting: () => false,
    });
    const window = (await manager.createFloatingNote()) as unknown as InstanceType<
      typeof electronMocks.MockBrowserWindow
    >;
    await vi.advanceTimersByTimeAsync(500);
    expect(manager.getNoteDockState().phase).toBe('hidden');

    electronMocks.setDisplays([
      { id: 1, workArea: { x: 0, y: 24, width: 1_440, height: 876 } },
      { id: 2, workArea: { x: 1_440, y: 24, width: 1_200, height: 876 } },
    ]);
    electronMocks.screen.emit('display-added');
    await vi.advanceTimersByTimeAsync(300);

    expect(manager.getNoteDockState()).toEqual({ edge: 'left', phase: 'hidden' });
    expect(window.getBounds()).toEqual({ x: 0, y: 100, width: 2, height: 400 });
    expect(window.showCalls).toBe(0);
    manager.closeAll();
  });

  it('moves a hidden note to the primary display and preserves its edge when its display is removed', async () => {
    const config = makeConfig({ x: 1_120, y: 100, width: 320, height: 400 });
    const manager = new WindowManager({
      config: config as unknown as ConfigService,
      logger: makeLogger(),
      preloadPath: '/preload.cjs',
      rendererHtmlPath: '/index.html',
      isQuitting: () => false,
    });
    const window = (await manager.createFloatingNote()) as unknown as InstanceType<
      typeof electronMocks.MockBrowserWindow
    >;
    await vi.advanceTimersByTimeAsync(500);
    expect(manager.getNoteDockState()).toEqual({ edge: 'right', phase: 'hidden' });

    electronMocks.setDisplays([
      { id: 2, workArea: { x: -1_920, y: 0, width: 1_920, height: 1_080 } },
    ]);
    electronMocks.screen.emit('display-removed');
    await vi.advanceTimersByTimeAsync(300);

    expect(manager.getNoteDockState()).toEqual({ edge: 'right', phase: 'hidden' });
    expect(window.getBounds()).toEqual({ x: -2, y: 109, width: 2, height: 400 });
    expect(config.snapshot().window_bounds).toEqual({
      x: -320,
      y: 109,
      width: 320,
      height: 400,
    });
    manager.closeAll();
  });

  it('falls back to a visible undocked note when the preserved edge becomes a seam', async () => {
    const config = makeConfig({ x: 1_120, y: 100, width: 320, height: 400 });
    const manager = new WindowManager({
      config: config as unknown as ConfigService,
      logger: makeLogger(),
      preloadPath: '/preload.cjs',
      rendererHtmlPath: '/index.html',
      isQuitting: () => false,
    });
    const window = (await manager.createFloatingNote()) as unknown as InstanceType<
      typeof electronMocks.MockBrowserWindow
    >;
    await vi.advanceTimersByTimeAsync(500);

    electronMocks.setDisplays([
      { id: 1, workArea: { x: 0, y: 24, width: 1_440, height: 876 } },
      { id: 2, workArea: { x: 1_440, y: 24, width: 1_200, height: 876 } },
    ]);
    electronMocks.screen.emit('display-added');
    await vi.advanceTimersByTimeAsync(300);

    expect(manager.getNoteDockState()).toEqual({ edge: null, phase: 'undocked' });
    expect(window.getBounds()).toEqual({ x: 1_120, y: 100, width: 320, height: 400 });
    expect(window.minimumSize).toEqual({ width: 280, height: 280 });
    expect(window.resizable).toBe(true);
    manager.closeAll();
  });

  it('uses a two-DIP top strip and fully restores when the setting is disabled', async () => {
    const config = makeConfig({ x: 500, y: 24, width: 320, height: 400 });
    const manager = new WindowManager({
      config: config as unknown as ConfigService,
      logger: makeLogger(),
      preloadPath: '/preload.cjs',
      rendererHtmlPath: '/index.html',
      isQuitting: () => false,
    });

    const window = (await manager.createFloatingNote()) as unknown as InstanceType<
      typeof electronMocks.MockBrowserWindow
    >;
    await vi.advanceTimersByTimeAsync(500);
    expect(manager.getNoteDockState()).toEqual({ edge: 'top', phase: 'hidden' });
    expect(window.getBounds()).toEqual({ x: 500, y: 24, width: 320, height: 2 });
    expect(window.minimumSize.height).toBe(2);
    expect(window.resizable).toBe(false);

    config.update({ edge_auto_hide: false });
    manager.applySettings({
      noteColor: '#FFF8E7',
      noteOpacity: 1,
      alwaysOnTop: true,
      showOnFullScreen: true,
      edgeAutoHideEnabled: false,
      edgeRevealColor: '#92400E',
      completedExpanded: false,
      addedDateDisplay: 'hover',
      dataDirectory: '/safe/data',
    });
    expect(manager.getNoteDockState()).toEqual({ edge: null, phase: 'undocked' });
    expect(window.getBounds()).toEqual({ x: 500, y: 24, width: 320, height: 400 });
    expect(window.minimumSize.height).toBe(280);
    expect(window.resizable).toBe(true);
    manager.closeAll();
  });

  it('keeps the note revealed while the real cursor stays over the draggable title area', async () => {
    const config = makeConfig();
    const manager = new WindowManager({
      config: config as unknown as ConfigService,
      logger: makeLogger(),
      preloadPath: '/preload.cjs',
      rendererHtmlPath: '/index.html',
      isQuitting: () => false,
    });

    const window = (await manager.createFloatingNote()) as unknown as InstanceType<
      typeof electronMocks.MockBrowserWindow
    >;
    await vi.advanceTimersByTimeAsync(500);
    expect(manager.getNoteDockState().phase).toBe('hidden');

    electronMocks.setCursorPoint({ x: 1, y: 110 });
    await vi.advanceTimersByTimeAsync(50);
    expect(manager.getNoteDockState().phase).toBe('docked-visible');
    expect(window.getBounds()).toEqual({ x: 0, y: 100, width: 320, height: 400 });

    electronMocks.setCursorPoint({ x: 160, y: 120 });
    manager.setNoteInteractionState({ pointerInside: false, autoHideBlocked: false });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(manager.getNoteDockState().phase).toBe('docked-visible');

    electronMocks.setCursorPoint({ x: 500, y: 500 });
    await vi.advanceTimersByTimeAsync(550);
    expect(manager.getNoteDockState().phase).toBe('hidden');
    manager.closeAll();
  });

  it('immediately undocks when a revealed note starts a manual drag', async () => {
    const config = makeConfig();
    const manager = new WindowManager({
      config: config as unknown as ConfigService,
      logger: makeLogger(),
      preloadPath: '/preload.cjs',
      rendererHtmlPath: '/index.html',
      isQuitting: () => false,
    });

    const window = (await manager.createFloatingNote()) as unknown as InstanceType<
      typeof electronMocks.MockBrowserWindow
    >;
    await vi.advanceTimersByTimeAsync(500);
    electronMocks.setCursorPoint({ x: 1, y: 110 });
    await vi.advanceTimersByTimeAsync(50);
    expect(manager.getNoteDockState().phase).toBe('docked-visible');

    window.simulateManualMove({ x: 300, y: 160 });
    expect(manager.getNoteDockState()).toEqual({ edge: null, phase: 'undocked' });
    electronMocks.setCursorPoint({ x: 700, y: 700 });
    await vi.advanceTimersByTimeAsync(1_000);

    expect(manager.getNoteDockState()).toEqual({ edge: null, phase: 'undocked' });
    expect(window.getBounds()).toEqual({ x: 300, y: 160, width: 320, height: 400 });
    expect(config.snapshot().window_bounds).toEqual({ x: 300, y: 160, width: 320, height: 400 });
    manager.closeAll();
  });

  it('shows the note across macOS Spaces only when always-on-top and fullscreen are enabled', async () => {
    const config = makeConfig({ x: 300, y: 160, width: 320, height: 400 });
    config.update({ edge_auto_hide: false });
    const manager = new WindowManager({
      config: config as unknown as ConfigService,
      logger: makeLogger(),
      preloadPath: '/preload.cjs',
      rendererHtmlPath: '/index.html',
      isQuitting: () => false,
    });

    const window = (await manager.createFloatingNote()) as unknown as InstanceType<
      typeof electronMocks.MockBrowserWindow
    >;
    expect(window.visibleOnAllWorkspacesCalls).toEqual([[true, { visibleOnFullScreen: true }]]);

    const baseSettings = {
      noteColor: '#FFF8E7',
      noteOpacity: 1,
      alwaysOnTop: true,
      showOnFullScreen: false,
      edgeAutoHideEnabled: false,
      edgeRevealColor: '#92400E',
      completedExpanded: false,
      addedDateDisplay: 'hover' as const,
      dataDirectory: '/safe/data',
    };
    manager.applySettings(baseSettings);
    expect(window.visibleOnAllWorkspacesCalls.at(-1)).toEqual([false, undefined]);

    manager.applySettings({ ...baseSettings, showOnFullScreen: true });
    expect(window.visibleOnAllWorkspacesCalls.at(-1)).toEqual([
      true,
      { visibleOnFullScreen: true },
    ]);

    const callCount = window.visibleOnAllWorkspacesCalls.length;
    manager.applySettings({ ...baseSettings, showOnFullScreen: true, noteOpacity: 0.8 });
    expect(window.visibleOnAllWorkspacesCalls).toHaveLength(callCount);

    manager.applySettings({ ...baseSettings, alwaysOnTop: false, showOnFullScreen: true });
    expect(window.alwaysOnTopCalls.at(-1)).toEqual([false, 'normal']);
    expect(window.visibleOnAllWorkspacesCalls.at(-1)).toEqual([false, undefined]);
    manager.closeAll();
  });
  it('reuses the creation window and prevents auto-hide while it is open', async () => {
    const manager = new WindowManager({
      config: makeConfig() as unknown as ConfigService,
      logger: makeLogger(),
      preloadPath: '/preload.cjs',
      rendererHtmlPath: '/index.html',
      isQuitting: () => false,
    });
    const note = (await manager.createFloatingNote()) as unknown as InstanceType<
      typeof electronMocks.MockBrowserWindow
    >;
    const creation = (await manager.openProjectCreate()) as unknown as InstanceType<
      typeof electronMocks.MockBrowserWindow
    >;
    expect(await manager.openProjectCreate()).toBe(creation);
    expect(electronMocks.MockBrowserWindow.instances).toHaveLength(2);
    manager.setNoteInteractionState({ pointerInside: false, autoHideBlocked: false });
    await vi.advanceTimersByTimeAsync(600);
    expect(manager.getNoteDockState().phase).toBe('docked-visible');
    manager.notifyProjectCreated('项目2', creation.webContents.id);
    expect(note.webContents.sent).toContainEqual({ channel: 'project:created', payload: '项目2' });
    const sentCount = note.webContents.sent.length;
    manager.notifyProjectCreated('不应切换', note.webContents.id);
    expect(note.webContents.sent).toHaveLength(sentCount);
    creation.destroyed = true;
    creation.emit('closed');
    expect(await manager.openProjectCreate()).not.toBe(creation);
    manager.closeAll();
  });
});
