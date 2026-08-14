import type { IpcMain } from 'electron';
import type { AppLogger } from '../logging/logger';
import type { ReportService } from '../services/reportService';
import type { ApiResult, ExportReportResult } from '../../shared/results';
import { isoWeekInputSchema } from './schemas';
import { IPC } from './channels';
import { toApiError } from './registerHandlers';

export interface RegisterReportHandlersOptions {
  ipcMain: Pick<IpcMain, 'handle' | 'removeHandler'>;
  reportService: Pick<ReportService, 'export' | 'openLast' | 'revealLast'>;
  logger: AppLogger;
}

export const registerReportHandlers = ({
  ipcMain,
  reportService,
  logger,
}: RegisterReportHandlersOptions): (() => void) => {
  ipcMain.handle(IPC.reportExport, async (_event, input: unknown): Promise<ExportReportResult> => {
    // 导出采用三态结果，取消是正常状态，因此不套用普通 ApiResult。
    const parsed = isoWeekInputSchema.safeParse(input);
    if (!parsed.success) return { status: 'failed', message: '周数无效，请刷新后重试' };
    try {
      return await reportService.export(parsed.data.isoYear, parsed.data.isoWeek);
    } catch (error) {
      logger.error('Report export IPC failed', { error });
      return { status: 'failed', message: '周报导出失败，请稍后重试' };
    }
  });

  const handleAction = (channel: string, action: () => Promise<void> | void): void => {
    // 打开/定位属于高权限 Shell 动作，只能作用于 ReportService 授权的最近导出路径。
    ipcMain.handle(channel, async (): Promise<ApiResult<void>> => {
      try {
        await action();
        return { ok: true, data: undefined };
      } catch (error) {
        return toApiError(error, logger);
      }
    });
  };
  handleAction(IPC.reportOpenLast, () => reportService.openLast());
  handleAction(IPC.reportRevealLast, () => reportService.revealLast());

  return () => {
    ipcMain.removeHandler(IPC.reportExport);
    ipcMain.removeHandler(IPC.reportOpenLast);
    ipcMain.removeHandler(IPC.reportRevealLast);
  };
};
