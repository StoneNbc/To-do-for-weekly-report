import type { IpcMain } from 'electron';
import type { ApiResult } from '../../shared/results';
import type { ReportSettingsSnapshot } from '../../shared/domain';
import type { AppLogger } from '../logging/logger';
import type { ReportSettingsService } from '../services/reportSettingsService';
import { IPC } from './channels';
import { reportSettingsPatchSchema, reportTextKindSchema } from './schemas';
import { toApiError } from './registerHandlers';

export interface RegisterReportSettingsHandlersOptions {
  ipcMain: Pick<IpcMain, 'handle' | 'removeHandler'>;
  settings: ReportSettingsService;
  logger: AppLogger;
}

export const registerReportSettingsHandlers = ({
  ipcMain,
  settings,
  logger,
}: RegisterReportSettingsHandlersOptions): (() => void) => {
  const wrap = async <T>(operation: () => Promise<T> | T): Promise<ApiResult<T>> => {
    try {
      return { ok: true, data: await operation() };
    } catch (error) {
      if (error instanceof RangeError) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: error.message } };
      }
      return toApiError(error, logger);
    }
  };

  ipcMain.handle(IPC.reportSettingsGet, () => wrap(() => settings.get()));
  ipcMain.handle(IPC.reportSettingsPreview, (_event, template: unknown) =>
    wrap(() => settings.preview(typeof template === 'string' ? template : '')),
  );
  ipcMain.handle(IPC.reportSettingsGetDefaultTemplate, (_event, kind: unknown) =>
    wrap(() => settings.getDefaultText(reportTextKindSchema.parse(kind))),
  );
  ipcMain.handle(IPC.reportSettingsSave, (_event, input: unknown) =>
    wrap<ReportSettingsSnapshot>(() => settings.save(reportSettingsPatchSchema.parse(input))),
  );
  ipcMain.handle(IPC.reportSettingsTestConnection, (_event, input: unknown) =>
    wrap(() => settings.testConnection(reportSettingsPatchSchema.parse(input))),
  );
  ipcMain.handle(IPC.reportSettingsConfirmConsent, () =>
    wrap(() => settings.confirmRemoteConsent()),
  );

  return () => {
    ipcMain.removeHandler(IPC.reportSettingsGet);
    ipcMain.removeHandler(IPC.reportSettingsPreview);
    ipcMain.removeHandler(IPC.reportSettingsGetDefaultTemplate);
    ipcMain.removeHandler(IPC.reportSettingsSave);
    ipcMain.removeHandler(IPC.reportSettingsTestConnection);
    ipcMain.removeHandler(IPC.reportSettingsConfirmConsent);
  };
};
