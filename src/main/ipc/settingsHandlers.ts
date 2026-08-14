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

export const registerSettingsHandlers = ({
  ipcMain,
  settings,
  shellActions,
  logger,
}: RegisterSettingsHandlersOptions): (() => void) => {
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
