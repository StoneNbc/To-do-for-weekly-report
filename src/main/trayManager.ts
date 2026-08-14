import { nativeImage, Tray } from 'electron';
import type { AppLogger } from './logging/logger';
import type { MenuFactory } from './menuFactory';

// 正式图标尚未提供时使用内嵌占位图，保证开发构建和托盘功能可用。
const FALLBACK_TRAY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAALElEQVR42mNgGAWjYBSMglEwCkbBKBgFgwH+//8/BoZRA2g0jIJRMAoGAG0hBB1vD2i8AAAAAElFTkSuQmCC';

export interface TrayManagerOptions {
  menuFactory: MenuFactory;
  onToggleNote: () => void;
  logger: AppLogger;
}

export class TrayManager {
  readonly #options: TrayManagerOptions;
  #tray: Tray | null = null;

  constructor(options: TrayManagerOptions) {
    this.#options = options;
  }

  create(): Tray {
    if (this.#tray && !this.#tray.isDestroyed()) return this.#tray;
    const image = nativeImage.createFromDataURL(FALLBACK_TRAY_PNG);
    // macOS 模板图会自动适配浅色/深色菜单栏。
    if (process.platform === 'darwin') image.setTemplateImage(true);
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
