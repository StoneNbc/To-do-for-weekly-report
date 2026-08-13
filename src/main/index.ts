import { app, ipcMain } from 'electron';
import { mkdir } from 'node:fs/promises';
import { AppLifecycle } from './appLifecycle';
import { IPC } from './ipc/channels';
import { LocalFileLogger } from './logging/logger';
import { MenuFactory, type DesktopCommands } from './menuFactory';
import { resolveDataPaths } from './platform/paths';
import { createShellActions } from './platform/shellActions';
import { ConfigService } from './services/configService';
import { TrayManager } from './trayManager';
import { getDefaultWindowPaths, WindowManager } from './windowManager';

const dataPaths = resolveDataPaths({ app });
const logger = new LocalFileLogger({
  file: dataPaths.logFile,
  debug: !app.isPackaged,
});
const config = new ConfigService({ configFile: dataPaths.configFile, logger });
const windowPaths = getDefaultWindowPaths(__dirname);

let windowManager: WindowManager | null = null;
let trayManager: TrayManager | null = null;
const lifecycle = new AppLifecycle({
  app,
  logger,
  showFloatingNote: () => windowManager?.showFloatingNote(),
  flushPendingWrites: async () => {
    windowManager?.saveCurrentBounds();
    await config.flush();
  },
});

if (lifecycle.acquireSingleInstance()) {
  lifecycle.register();

  app.whenReady()
    .then(async () => {
      await Promise.all([
        mkdir(dataPaths.weeksDirectory, { recursive: true }),
        mkdir(dataPaths.logsDirectory, { recursive: true }),
      ]);
      await config.initialize();

      windowManager = new WindowManager({
        config,
        logger,
        ...windowPaths,
        ...(process.env.VITE_DEV_SERVER_URL ? { rendererDevUrl: process.env.VITE_DEV_SERVER_URL } : {}),
        isQuitting: lifecycle.isQuitting,
      });
      const shellActions = createShellActions(dataPaths.root);

      const commands: DesktopCommands = {
        toggleNote: () => windowManager?.toggleFloatingNote(),
        showNote: () => windowManager?.showFloatingNote(),
        openWeekly: () => void windowManager?.openWeekly(),
        exportCurrentWeek: () => {
          logger.info('Report export command requested before ReportService is implemented');
        },
        openDataDirectory: () => void shellActions.openDataDirectory().catch((error) => logger.error('Data directory could not be opened', { error })),
        setAlwaysOnTop: (enabled) => {
          windowManager?.setAlwaysOnTop(enabled);
          trayManager?.refreshMenu();
        },
        requestQuit: () => lifecycle.requestQuit(),
        isNoteVisible: () => windowManager?.isFloatingNoteVisible() ?? false,
        isAlwaysOnTop: () => windowManager?.isAlwaysOnTop() ?? config.get().always_on_top,
      };
      const menuFactory = new MenuFactory(commands);
      windowManager.setMenuFactory(menuFactory);
      trayManager = new TrayManager({
        menuFactory,
        onToggleNote: commands.toggleNote,
        logger,
      });

      registerPlatformHandlers(windowManager, shellActions.openDataDirectory, lifecycle);
      await windowManager.createFloatingNote();
      trayManager.create();
      logger.info('Application ready', { dataDirectory: dataPaths.root });
    })
    .catch((error: unknown) => {
      logger.error('Application startup failed', { error });
      lifecycle.requestQuit();
    });
}

const registerPlatformHandlers = (
  windows: WindowManager,
  openDataDirectory: () => Promise<void>,
  appLifecycle: AppLifecycle,
): void => {
  ipcMain.handle(IPC.healthCheck, () => ({ status: 'ok' as const }));
  ipcMain.handle(IPC.windowOpenWeekly, async () => {
    await windows.openWeekly();
  });
  ipcMain.handle(IPC.windowShowNote, () => windows.showFloatingNote());
  ipcMain.handle(IPC.appOpenDataFolder, () => openDataDirectory());
  ipcMain.handle(IPC.appSetAlwaysOnTop, (_event, enabled: unknown) => {
    if (typeof enabled !== 'boolean') {
      return { ok: false as const, error: { code: 'INVALID_INPUT' as const, message: '置顶状态必须为布尔值' } };
    }
    windows.setAlwaysOnTop(enabled);
    return { ok: true as const, data: undefined };
  });
  ipcMain.handle(IPC.appQuit, () => appLifecycle.requestQuit());
};
