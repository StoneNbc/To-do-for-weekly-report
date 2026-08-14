import { app, dialog, ipcMain, powerMonitor, session, shell } from 'electron';
import { mkdir } from 'node:fs/promises';
import { AppLifecycle } from './appLifecycle';
import { IPC } from './ipc/channels';
import { LocalFileLogger } from './logging/logger';
import { MenuFactory, type DesktopCommands } from './menuFactory';
import { resolveDataPaths } from './platform/paths';
import { createShellActions } from './platform/shellActions';
import { ConfigService } from './services/configService';
import { TextFileStore } from './repositories/textFileStore';
import { TodayRepository } from './repositories/todayRepository';
import { WeekRepository } from './repositories/weekRepository';
import { ArchiveService } from './services/archiveService';
import { TaskService } from './services/taskService';
import { WeeklyService } from './services/weeklyService';
import { FileWatcherService, getCurrentWeekPath } from './services/fileWatcher';
import { ArchiveScheduler } from './services/scheduler';
import { registerBusinessHandlers } from './ipc/registerHandlers';
import { registerReportHandlers } from './ipc/reportHandlers';
import { createReportAgent } from './agents/agentFactory';
import { ReportService } from './services/reportService';
import { TrayManager } from './trayManager';
import { getDefaultWindowPaths, WindowManager } from './windowManager';
import { installLocalOnlyNetworkPolicy } from './platform/networkPolicy';

// Main Process 组合根：这里只负责实例化和接线，文本规则与业务流程留在各自 Service。
const dataPaths = resolveDataPaths({ app });
const logger = new LocalFileLogger({
  file: dataPaths.logFile,
  debug: !app.isPackaged,
});
const config = new ConfigService({ configFile: dataPaths.configFile, logger });
const windowPaths = getDefaultWindowPaths(__dirname);

let windowManager: WindowManager | null = null;
let trayManager: TrayManager | null = null;
let fileWatcher: FileWatcherService | null = null;
let scheduler: ArchiveScheduler | null = null;
let reportService: ReportService | null = null;
// Today 与 Week Repository 共享 Store，确保同一路径写入都经过同一串行队列。
const textFileStore = new TextFileStore();
const lifecycle = new AppLifecycle({
  app,
  logger,
  showFloatingNote: () => windowManager?.showFloatingNote(),
  flushPendingWrites: async () => {
    windowManager?.saveCurrentBounds();
    await Promise.all([config.flush(), textFileStore.drain(), reportService?.drain()]);
  },
  stopBackgroundServices: async () => {
    await Promise.all([fileWatcher?.stop(), scheduler?.stop()]);
  },
});

if (lifecycle.acquireSingleInstance()) {
  lifecycle.register();

  app
    .whenReady()
    .then(async () => {
      // 目录与配置必须先就绪，后台服务和窗口才可以开始访问业务数据。
      await Promise.all([
        mkdir(dataPaths.weeksDirectory, { recursive: true }),
        mkdir(dataPaths.logsDirectory, { recursive: true }),
      ]);
      await config.initialize();
      // 生产环境不允许网络；开发环境仅放行当前 Vite origin 和热更新 WebSocket。
      installLocalOnlyNetworkPolicy(
        session.defaultSession,
        logger,
        process.env.VITE_DEV_SERVER_URL,
      );

      const todayRepository = new TodayRepository(dataPaths.todayFile, textFileStore);
      const weekRepository = new WeekRepository(dataPaths.weeksDirectory, textFileStore);
      const archiveService = new ArchiveService(todayRepository, weekRepository);
      const taskService = new TaskService(todayRepository, archiveService);
      const weeklyService = new WeeklyService(weekRepository, todayRepository);

      windowManager = new WindowManager({
        config,
        logger,
        ...windowPaths,
        ...(process.env.VITE_DEV_SERVER_URL
          ? { rendererDevUrl: process.env.VITE_DEV_SERVER_URL }
          : {}),
        isQuitting: lifecycle.isQuitting,
      });
      const shellActions = createShellActions(dataPaths.root);
      fileWatcher = new FileWatcherService({
        paths: dataPaths,
        todayRepository,
        logger,
        broadcast: (event) => windowManager?.broadcastDataChanged(event),
      });
      scheduler = new ArchiveScheduler({ archive: archiveService, powerMonitor, logger });
      reportService = new ReportService({
        weeklyService,
        agentProvider: { getAgent: () => createReportAgent(config.get(), logger) },
        dialog: {
          showSaveDialog: (window, options) =>
            window ? dialog.showSaveDialog(window, options) : dialog.showSaveDialog(options),
        },
        shell,
        logger,
        getDialogWindow: () => windowManager?.getActiveWindow(),
      });

      const commands: DesktopCommands = {
        toggleNote: () => windowManager?.toggleFloatingNote(),
        showNote: () => windowManager?.showFloatingNote(),
        openWeekly: () => void windowManager?.openWeekly(),
        exportCurrentWeek: () => {
          void reportService?.exportCurrentWeekFromMenu();
        },
        openDataDirectory: () =>
          void shellActions
            .openDataDirectory()
            .catch((error) => logger.error('Data directory could not be opened', { error })),
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

      // 所有 IPC handler 在 Renderer 加载前完成注册，避免首屏调用落入未注册通道。
      registerPlatformHandlers(windowManager, shellActions.openDataDirectory, lifecycle);
      registerBusinessHandlers({
        ipcMain,
        services: { task: taskService, weekly: weeklyService },
        logger,
        onAppWrite: (scope, revision) => fileWatcher?.markScopeWrite(scope, revision),
        onWeekAppWrite: (isoYear, isoWeek, revision) =>
          fileWatcher?.markAppWrite(getCurrentWeekPath(dataPaths, isoYear, isoWeek), revision),
      });
      registerReportHandlers({ ipcMain, reportService, logger });
      // Scheduler 先执行启动补偿，再启动 Watcher；这样补偿写入不会被误判为外部编辑。
      await scheduler.start();
      await fileWatcher.start();
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
  // 平台通道同样把 Renderer 输入视为不可信数据，不直接传给 Electron API。
  ipcMain.handle(IPC.healthCheck, () => ({ status: 'ok' as const }));
  ipcMain.handle(IPC.windowOpenWeekly, async () => {
    await windows.openWeekly();
  });
  ipcMain.handle(IPC.windowShowNote, () => windows.showFloatingNote());
  ipcMain.handle(IPC.appOpenDataFolder, () => openDataDirectory());
  ipcMain.handle(IPC.appSetAlwaysOnTop, (_event, enabled: unknown) => {
    if (typeof enabled !== 'boolean') {
      return {
        ok: false as const,
        error: { code: 'INVALID_INPUT' as const, message: '置顶状态必须为布尔值' },
      };
    }
    windows.setAlwaysOnTop(enabled);
    return { ok: true as const, data: undefined };
  });
  ipcMain.handle(IPC.appQuit, () => appLifecycle.requestQuit());
};
