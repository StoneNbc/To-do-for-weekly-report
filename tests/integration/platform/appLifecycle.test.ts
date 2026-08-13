import { EventEmitter } from 'node:events';
import type { App } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { AppLifecycle } from '../../../src/main/appLifecycle';
import type { AppLogger } from '../../../src/main/logging/logger';

class FakeApp extends EventEmitter {
  lock = true;
  quit = vi.fn();
  requestSingleInstanceLock = vi.fn(() => this.lock);
}

const makeLogger = (): AppLogger => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  flush: vi.fn(async () => undefined),
});

describe('AppLifecycle', () => {
  it('quits immediately when another instance owns the lock', () => {
    const app = new FakeApp();
    app.lock = false;
    const lifecycle = new AppLifecycle({
      app: app as unknown as App,
      logger: makeLogger(),
      showFloatingNote: vi.fn(),
      flushPendingWrites: vi.fn(async () => undefined),
    });

    expect(lifecycle.acquireSingleInstance()).toBe(false);
    expect(app.quit).toHaveBeenCalledOnce();
  });

  it('shows the existing note after a second instance is started', () => {
    const app = new FakeApp();
    const showFloatingNote = vi.fn();
    const lifecycle = new AppLifecycle({
      app: app as unknown as App,
      logger: makeLogger(),
      showFloatingNote,
      flushPendingWrites: vi.fn(async () => undefined),
    });

    expect(lifecycle.acquireSingleInstance()).toBe(true);
    app.emit('second-instance');
    expect(showFloatingNote).toHaveBeenCalledOnce();
  });

  it('prevents the first quit attempt until pending writes and logs flush', async () => {
    const app = new FakeApp();
    const logger = makeLogger();
    const flushPendingWrites = vi.fn(async () => undefined);
    const lifecycle = new AppLifecycle({
      app: app as unknown as App,
      logger,
      showFloatingNote: vi.fn(),
      flushPendingWrites,
    });
    lifecycle.register();
    const preventDefault = vi.fn();

    app.emit('before-quit', { preventDefault });
    await vi.waitFor(() => expect(app.quit).toHaveBeenCalledOnce());

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(lifecycle.isQuitting()).toBe(true);
    expect(flushPendingWrites).toHaveBeenCalledOnce();
    expect(logger.flush).toHaveBeenCalledOnce();
  });
});
