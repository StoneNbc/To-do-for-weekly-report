import { nativeImage, Tray } from 'electron';
import type { AppLogger } from './logging/logger';
import type { MenuFactory } from './menuFactory';

// 图标文件损坏或缺失时使用内嵌占位图，保证应用仍能进入托盘。
const FALLBACK_TRAY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAALElEQVR42mNgGAWjYBSMglEwCkbBKBgFgwH+//8/BoZRA2g0jIJRMAoGAG0hBB1vD2i8AAAAAElFTkSuQmCC';

export interface TrayManagerOptions {
  menuFactory: MenuFactory;
  onToggleNote: () => void;
  logger: AppLogger;
  iconPath?: string;
}

/**
 * 系统托盘管理器：创建托盘图标、设置右键菜单和点击行为。
 * 图标文件损坏或缺失时回退到内嵌占位图，保证应用仍能进入托盘。
 */
export class TrayManager {
  readonly #options: TrayManagerOptions;
  #tray: Tray | null = null;

  constructor(options: TrayManagerOptions) {
    this.#options = options;
  }

  create(): Tray {
    if (this.#tray && !this.#tray.isDestroyed()) return this.#tray;
    let image = this.#options.iconPath
      ? nativeImage.createFromPath(this.#options.iconPath)
      : nativeImage.createFromDataURL(FALLBACK_TRAY_PNG);
    if (image.isEmpty()) {
      this.#options.logger.warn('Tray icon could not be loaded; using fallback', {
        path: this.#options.iconPath,
      });
      image = nativeImage.createFromDataURL(FALLBACK_TRAY_PNG);
    }
    const tray = new Tray(image);
    tray.setToolTip('悬浮便利贴');
    tray.setContextMenu(this.#options.menuFactory.createTrayMenu());
    tray.on('click', () => {
      this.#options.onToggleNote();
      this.refreshMenu();
    });
    tray.on('right-click', () => this.refreshMenu());
    this.#tray = tray;
    this.#options.logger.info('System tray created');
    return tray;
  }

  refreshMenu(): void {
    if (this.#tray && !this.#tray.isDestroyed()) {
      this.#tray.setContextMenu(this.#options.menuFactory.createTrayMenu());
    }
  }

  destroy(): void {
    this.#tray?.destroy();
    this.#tray = null;
  }
}
