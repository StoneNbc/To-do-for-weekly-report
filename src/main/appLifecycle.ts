import type { App } from 'electron';
import type { AppLogger } from './logging/logger';

export interface AppLifecycleOptions {
  app: App;
  logger: AppLogger;
  showFloatingNote: () => void;
  flushPendingWrites: () => Promise<void>;
}

export class AppLifecycle {
  readonly #options: AppLifecycleOptions;
  #isQuitting = false;
  #quitSequenceStarted = false;

  constructor(options: AppLifecycleOptions) {
    this.#options = options;
  }

  acquireSingleInstance(): boolean {
    const acquired = this.#options.app.requestSingleInstanceLock();
    if (!acquired) {
      this.#options.app.quit();
      return false;
    }

    this.#options.app.on('second-instance', () => this.#options.showFloatingNote());
    return true;
  }

  register(): void {
    // Keep the app alive after all windows are hidden or the weekly window is closed.
    this.#options.app.on('window-all-closed', () => undefined);
    this.#options.app.on('activate', () => this.#options.showFloatingNote());
    this.#options.app.on('before-quit', (event) => {
      if (this.#quitSequenceStarted) return;
      event.preventDefault();
      this.#isQuitting = true;
      this.#quitSequenceStarted = true;
      void this.#finishQuit();
    });
  }

  isQuitting = (): boolean => this.#isQuitting;

  requestQuit(): void {
    this.#options.app.quit();
  }

  async #finishQuit(): Promise<void> {
    try {
      await this.#options.flushPendingWrites();
    } catch (error) {
      this.#options.logger.error('Pending writes did not flush cleanly during exit', { error });
    } finally {
      await this.#options.logger.flush();
      this.#options.app.quit();
    }
  }
}
