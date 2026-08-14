import { Menu, type MenuItemConstructorOptions } from 'electron';

export interface DesktopCommands {
  toggleNote(): void;
  showNote(): void;
  openWeekly(): void;
  exportCurrentWeek(): void;
  openDataDirectory(): void;
  setAlwaysOnTop(enabled: boolean): void;
  requestQuit(): void;
  isNoteVisible(): boolean;
  isAlwaysOnTop(): boolean;
}

export class MenuFactory {
  constructor(private readonly commands: DesktopCommands) {}

  createTrayMenu(): Menu {
    return Menu.buildFromTemplate(this.#template(true));
  }

  createNoteContextMenu(): Menu {
    return Menu.buildFromTemplate(this.#template(false));
  }

  #template(includeToggle: boolean): MenuItemConstructorOptions[] {
    // 每次打开菜单都重新读取可见性和置顶状态，避免 Tray 展示过期勾选值。
    return [
      includeToggle
        ? {
            label: this.commands.isNoteVisible() ? '隐藏便利贴' : '显示便利贴',
            click: () => this.commands.toggleNote(),
          }
        : { label: '显示便利贴', click: () => this.commands.showNote() },
      { label: '打开周记', click: () => this.commands.openWeekly() },
      { label: '导出本周周报', click: () => this.commands.exportCurrentWeek() },
      { type: 'separator' },
      { label: '打开数据文件夹', click: () => this.commands.openDataDirectory() },
      {
        label: '保持置顶',
        type: 'checkbox',
        checked: this.commands.isAlwaysOnTop(),
        click: (item) => this.commands.setAlwaysOnTop(item.checked),
      },
      { type: 'separator' },
      { label: '退出', click: () => this.commands.requestQuit() },
    ];
  }
}
