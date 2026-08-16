import { app, dialog, ipcMain, powerMonitor, safeStorage, session, shell } from 'electron';
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
import { TemplateAgent } from './agents/templateAgent';
import { OpenAICompatibleAgent } from './agents/openAICompatibleAgent';
import { getLlmCredentialOrigin } from './agents/llmEndpointPolicy';
import { ReportService } from './services/reportService';
import { TrayManager } from './trayManager';
import { getDefaultWindowPaths, WindowManager } from './windowManager';
import { installLocalOnlyNetworkPolicy } from './platform/networkPolicy';
import { SettingsService } from './services/settingsService';
import { registerSettingsHandlers } from './ipc/settingsHandlers';
import { CredentialService } from './services/credentialService';
import { ReportTemplateService } from './services/reportTemplateService';
import { ReportSettingsService } from './services/reportSettingsService';
import { registerReportSettingsHandlers } from './ipc/reportSettingsHandlers';
import { DEFAULT_REMOTE_REPORT_TEMPLATE, DEFAULT_REPORT_PROMPT } from '../shared/constants';
import { validateReportPrompt } from './agents/reportTemplate';

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
      // Renderer 始终禁止业务网络；远程模型请求只允许由 Main 的受控客户端发起。
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
      const recordTemplates = new ReportTemplateService(dataPaths.reportTemplateFile);
      const remoteTemplates = new ReportTemplateService(
        dataPaths.remoteReportTemplateFile,
        DEFAULT_REMOTE_REPORT_TEMPLATE,
      );
      const prompts = new ReportTemplateService(
        dataPaths.reportPromptFile,
        DEFAULT_REPORT_PROMPT,
        validateReportPrompt,
      );
      const credentials = new CredentialService(dataPaths.secretsFile, safeStorage, logger);
      const reportSettings = new ReportSettingsService({
        config,
        recordTemplates,
        remoteTemplates,
        prompts,
        credentials,
      });

      windowManager = new WindowManager({
        config,
        logger,
        ...windowPaths,
        ...(process.env.VITE_DEV_SERVER_URL
          ? { rendererDevUrl: process.env.VITE_DEV_SERVER_URL }
          : {}),
        isQuitting: lifecycle.isQuitting,
      });
      const shellActions = createShellActions(dataPaths.root, dataPaths.logsDirectory);
      const settingsService = new SettingsService({
        config,
        dataDirectory: dataPaths.root,
        runtime: {
          previewAppearance: (appearance) => windowManager?.previewAppearance(appearance),
          applySettings: (snapshot) => {
            windowManager?.applySettings(snapshot);
            trayManager?.refreshMenu();
          },
          broadcastSettingsChanged: (snapshot) => windowManager?.broadcastSettingsChanged(snapshot),
        },
      });
      windowManager.setSettingsCloseHandler(() => settingsService.cancelAppearancePreview());
      fileWatcher = new FileWatcherService({
        paths: dataPaths,
        todayRepository,
        logger,
        broadcast: (event) => windowManager?.broadcastDataChanged(event),
      });
      scheduler = new ArchiveScheduler({ archive: archiveService, powerMonitor, logger });
      reportService = new ReportService({
        weeklyService,
        pendingTaskSource: taskService,
        agentProvider: {
          getAgent: async () => {
            const current = config.get();
            const recordTemplate = await recordTemplates.read(current.template_path);
            if (current.agent === 'template') return new TemplateAgent(recordTemplate);
            const [remoteTemplate, prompt] = await Promise.all([
              remoteTemplates.read(current.remote_template_path),
              prompts.read(current.report_prompt_path),
            ]);
            const origin = getLlmCredentialOrigin(
              current.llm.baseUrl,
              current.llm.allowInsecureHttp,
            );
            const credential = await credentials.get(origin);
            return new OpenAICompatibleAgent({
              settings: current.llm,
              recordTemplate,
              remoteTemplate,
              prompt,
              apiKey: credential?.apiKey ?? null,
            });
          },
        },
        dialog: {
          showSaveDialog: (window, options) =>
            window ? dialog.showSaveDialog(window, options) : dialog.showSaveDialog(options),
        },
        shell,
        logger,
        getDialogWindow: () => windowManager?.getActiveWindow(),
        isRemoteConsentConfirmed: () => config.get().remote_consent_confirmed,
      });

      const commands: DesktopCommands = {
        toggleNote: () => windowManager?.toggleFloatingNote(),
        showNote: () => windowManager?.showFloatingNote(),
        openWeekly: () => void windowManager?.openWeekly(),
        openSettings: () => void windowManager?.openSettings(),
        exportCurrentWeek: () => {
          void windowManager?.requestCurrentWeekReportGeneration();
        },
        openDataDirectory: () =>
          void shellActions
            .openDataDirectory()
            .catch((error) => logger.error('Data directory could not be opened', { error })),
        setAlwaysOnTop: (enabled) => {
          void settingsService.update({ alwaysOnTop: enabled }).catch((error) => {
            trayManager?.refreshMenu();
            logger.error('Always-on-top setting could not be saved', { error });
          });
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
      registerPlatformHandlers(
        windowManager,
        shellActions.openDataDirectory,
        lifecycle,
        settingsService,
      );
      registerBusinessHandlers({
        ipcMain,
        services: { task: taskService, weekly: weeklyService },
        logger,
        onAppWrite: (scope, revision) => fileWatcher?.markScopeWrite(scope, revision),
        onWeekAppWrite: (isoYear, isoWeek, revision) =>
          fileWatcher?.markAppWrite(getCurrentWeekPath(dataPaths, isoYear, isoWeek), revision),
      });
      registerReportHandlers({ ipcMain, reportService, logger });
      registerSettingsHandlers({ ipcMain, settings: settingsService, shellActions, logger });
      registerReportSettingsHandlers({ ipcMain, settings: reportSettings, logger });
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
  settings: SettingsService,
): void => {
  // 平台通道同样把 Renderer 输入视为不可信数据，不直接传给 Electron API。
  ipcMain.handle(IPC.healthCheck, () => ({ status: 'ok' as const }));
  ipcMain.handle(IPC.windowOpenWeekly, async () => {
    await windows.openWeekly();
  });
  ipcMain.handle(IPC.windowGenerateCurrentWeekReport, async () => {
    await windows.requestCurrentWeekReportGeneration();
  });
  ipcMain.handle(IPC.windowShowNote, () => windows.showFloatingNote());
  ipcMain.handle(IPC.windowOpenSettings, async () => {
    await windows.openSettings();
  });
  ipcMain.handle(IPC.windowSetSettingsDirty, (_event, dirty: unknown) => {
    if (typeof dirty !== 'boolean') throw new RangeError('设置修改状态必须是布尔值');
    windows.setSettingsDirty(dirty);
  });
  ipcMain.handle(IPC.windowDiscardSettingsChangesAndClose, () => {
    windows.discardSettingsChangesAndClose();
  });
  ipcMain.handle(IPC.appOpenDataFolder, () => openDataDirectory());
  ipcMain.handle(IPC.appSetAlwaysOnTop, async (_event, enabled: unknown) => {
    if (typeof enabled !== 'boolean') {
      return {
        ok: false as const,
        error: { code: 'INVALID_INPUT' as const, message: '置顶状态必须为布尔值' },
      };
    }
    try {
      await settings.update({ alwaysOnTop: enabled });
      return { ok: true as const, data: undefined };
    } catch {
      return {
        ok: false as const,
        error: { code: 'IO_ERROR' as const, message: '设置暂时无法保存，请稍后重试' },
      };
    }
  });
  ipcMain.handle(IPC.appQuit, () => appLifecycle.requestQuit());
};
