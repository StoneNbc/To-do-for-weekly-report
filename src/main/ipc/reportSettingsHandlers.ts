import type { IpcMain } from 'electron';
import type { ApiResult } from '../../shared/results';
import type { ReportSettingsSnapshot } from '../../shared/domain';
import type { AppLogger } from '../logging/logger';
import type { ReportSettingsService } from '../services/reportSettingsService';
import { IPC } from './channels';
import {
  llmConnectionTestInputSchema,
  reportSettingsPatchSchema,
  reportTextKindSchema,
} from './schemas';
import { toApiError } from './registerHandlers';

export interface RegisterReportSettingsHandlersOptions {
  ipcMain: Pick<IpcMain, 'handle' | 'removeHandler'>;
  settings: ReportSettingsService;
  logger: AppLogger;
}

/** 注册周报设置白名单 IPC；所有 Renderer 输入都在进入 Service 前执行运行时校验。 */
export const registerReportSettingsHandlers = ({
  ipcMain,
  settings,
  logger,
}: RegisterReportSettingsHandlersOptions): (() => void) => {
  // 统一把可预期校验错误映射为 INVALID_INPUT，其他异常交给脱敏错误边界处理。
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
    wrap(() => settings.testConnection(llmConnectionTestInputSchema.parse(input))),
  );
  ipcMain.handle(IPC.reportSettingsConfirmConsent, () =>
    wrap(() => settings.confirmRemoteConsent()),
  );

  return () => {
    // 测试重建或应用退出时完整卸载，避免重复注册同名 Electron handler。
    ipcMain.removeHandler(IPC.reportSettingsGet);
    ipcMain.removeHandler(IPC.reportSettingsPreview);
    ipcMain.removeHandler(IPC.reportSettingsGetDefaultTemplate);
    ipcMain.removeHandler(IPC.reportSettingsSave);
    ipcMain.removeHandler(IPC.reportSettingsTestConnection);
    ipcMain.removeHandler(IPC.reportSettingsConfirmConsent);
  };
};
