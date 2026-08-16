import type { IpcMain } from 'electron';
import type { AppLogger } from '../logging/logger';
import type { ShellActions } from '../platform/shellActions';
import type { SettingsService } from '../services/settingsService';
import { IPC } from './channels';
import { appearancePreviewSchema, settingsPatchSchema } from './schemas';
import { toApiError } from './registerHandlers';

export interface RegisterSettingsHandlersOptions {
  ipcMain: Pick<IpcMain, 'handle' | 'removeHandler'>;
  settings: Pick<SettingsService, 'get' | 'previewAppearance' | 'update' | 'resetAppearance'>;
  shellActions: Pick<ShellActions, 'openLogsDirectory' | 'copyDataDirectoryPath'>;
  logger: AppLogger;
}

/** 设置 IPC 只暴露具体操作，不把任意文件路径、Shell 命令或 ConfigService 交给 Renderer。 */
export const registerSettingsHandlers = ({
  ipcMain,
  settings,
  shellActions,
  logger,
}: RegisterSettingsHandlersOptions): (() => void) => {
  // 记录实际注册的通道，使测试和应用重建能够对称卸载全部 handler。
  const channels: string[] = [];
  const handle = <T>(channel: string, operation: (...args: unknown[]) => Promise<T> | T): void => {
    channels.push(channel);
    ipcMain.handle(channel, async (_event, ...args: unknown[]) => {
      try {
        return { ok: true as const, data: await operation(...args) };
      } catch (error) {
        return toApiError(error, logger);
      }
    });
  };

  handle(IPC.settingsGet, () => settings.get());
  handle(IPC.settingsPreviewAppearance, (input) => {
    settings.previewAppearance(appearancePreviewSchema.parse(input));
  });
  handle(IPC.settingsUpdate, (input) => settings.update(settingsPatchSchema.parse(input)));
  handle(IPC.settingsResetAppearance, () => settings.resetAppearance());
  handle(IPC.settingsOpenLogsFolder, () => shellActions.openLogsDirectory());
  handle(IPC.settingsCopyDataPath, () => shellActions.copyDataDirectoryPath());

  return () => channels.forEach((channel) => ipcMain.removeHandler(channel));
};
