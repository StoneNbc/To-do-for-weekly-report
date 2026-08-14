import type { App } from 'electron';
import type { AppLogger } from './logging/logger';

export interface AppLifecycleOptions {
  app: App;
  logger: AppLogger;
  showFloatingNote: () => void;
  flushPendingWrites: () => Promise<void>;
  stopBackgroundServices?: () => Promise<void>;
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

    // 第二次启动不创建新进程数据写入者，只唤起已有便利贴。
    this.#options.app.on('second-instance', () => this.#options.showFloatingNote());
    return true;
  }

  register(): void {
    // 所有窗口隐藏/关闭后仍保持托盘和零点归档运行。
    this.#options.app.on('window-all-closed', () => undefined);
    this.#options.app.on('activate', () => this.#options.showFloatingNote());
    this.#options.app.on('before-quit', (event) => {
      if (this.#quitSequenceStarted) return;
      // 第一次退出先拦截，等待后台服务和原子写队列排空；第二次才真正退出。
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
      await this.#options.stopBackgroundServices?.();
      await this.#options.flushPendingWrites();
    } catch (error) {
      this.#options.logger.error('Pending writes did not flush cleanly during exit', { error });
    } finally {
      await this.#options.logger.flush();
      this.#options.app.quit();
    }
  }
}
