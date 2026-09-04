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

  class MockWebContents extends MockEmitter {
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
    destroyed = false;

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

    setAlwaysOnTop(): void {}
    setVisibleOnAllWorkspaces(): void {}
    setOpacity(): void {}
    isMinimized(): boolean {
      return false;
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
      this.visible = true;
    }
    hide(): void {
      this.visible = false;
    }
    focus(): void {
      MockBrowserWindow.focused = this;
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

  const display = { id: 1, workArea: { x: 0, y: 24, width: 1_440, height: 876 } };
  let cursorPoint = { x: -1_000, y: -1_000 };
  const screen = Object.assign(new MockEmitter(), {
    getPrimaryDisplay: () => display,
    getAllDisplays: () => [display],
    getDisplayMatching: () => display,
    getCursorScreenPoint: () => ({ ...cursorPoint }),
  });

  return {
    MockBrowserWindow,
    screen,
    setCursorPoint: (point: { x: number; y: number }) => {
      cursorPoint = point;
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
    expect(window.getBounds()).toEqual({ x: -316, y: 100, width: 320, height: 400 });
    expect(config.snapshot().window_bounds).toEqual({ x: 0, y: 100, width: 320, height: 400 });

    electronMocks.setCursorPoint({ x: 1, y: 110 });
    manager.setNoteInteractionState({ pointerInside: true, autoHideBlocked: false });
    expect(manager.getNoteDockState()).toEqual({ edge: 'left', phase: 'docked-visible' });
    expect(window.getBounds()).toEqual({ x: 0, y: 100, width: 320, height: 400 });
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

  it('uses a four-DIP top strip and fully restores when the setting is disabled', async () => {
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
    expect(window.getBounds()).toEqual({ x: 500, y: 24, width: 320, height: 4 });
    expect(window.minimumSize.height).toBe(4);
    expect(window.resizable).toBe(false);

    config.update({ edge_auto_hide: false });
    manager.applySettings({
      noteColor: '#FFF8E7',
      noteOpacity: 1,
      alwaysOnTop: true,
      edgeAutoHideEnabled: false,
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
});
