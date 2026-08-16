import type { IpcMain } from 'electron';
import type { AppLogger } from '../logging/logger';
import type { ReportService } from '../services/reportService';
import type { ReportDraft } from '../../shared/domain';
import type { ApiResult, ExportReportResult } from '../../shared/results';
import { isoWeekInputSchema, reportDraftSaveSchema, reportGenerationInputSchema } from './schemas';
import { IPC } from './channels';
import { toApiError } from './registerHandlers';

export interface RegisterReportHandlersOptions {
  ipcMain: Pick<IpcMain, 'handle' | 'removeHandler'>;
  reportService: Pick<ReportService, 'export' | 'openLast' | 'revealLast'> &
    Partial<Pick<ReportService, 'generateDraft' | 'saveDraft' | 'discardDraft'>>;
  logger: AppLogger;
}

export const registerReportHandlers = ({
  ipcMain,
  reportService,
  logger,
}: RegisterReportHandlersOptions): (() => void) => {
  const controllers = new Map<string, AbortController>();
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

  ipcMain.handle(
    IPC.reportGenerate,
    async (_event, input: unknown): Promise<ApiResult<ReportDraft>> => {
      const parsed = reportGenerationInputSchema.safeParse(input);
      if (!parsed.success) return toApiError(parsed.error, logger);
      const controller = new AbortController();
      controllers.get(parsed.data.requestId)?.abort();
      controllers.set(parsed.data.requestId, controller);
      try {
        const draft = await reportService.generateDraft!(
          parsed.data.isoYear,
          parsed.data.isoWeek,
          controller.signal,
        );
        return { ok: true, data: draft };
      } catch (error) {
        return toApiError(error, logger);
      } finally {
        controllers.delete(parsed.data.requestId);
      }
    },
  );

  ipcMain.handle(IPC.reportCancel, (_event, requestId: unknown): ApiResult<void> => {
    if (typeof requestId !== 'string') {
      return { ok: false, error: { code: 'INVALID_INPUT', message: '取消请求无效' } };
    }
    controllers.get(requestId)?.abort();
    controllers.delete(requestId);
    return { ok: true, data: undefined };
  });

  ipcMain.handle(
    IPC.reportSaveDraft,
    async (_event, input: unknown): Promise<ExportReportResult> => {
      const parsed = reportDraftSaveSchema.safeParse(input);
      if (!parsed.success) return { status: 'failed', message: '周报草稿无效' };
      try {
        return await reportService.saveDraft!(parsed.data.draftId, parsed.data.content);
      } catch (error) {
        const result = toApiError(error, logger);
        return {
          status: 'failed',
          message: result.ok ? '周报保存失败' : result.error.message,
        };
      }
    },
  );

  ipcMain.handle(IPC.reportDiscardDraft, (_event, draftId: unknown): ApiResult<void> => {
    if (typeof draftId !== 'string') {
      return { ok: false, error: { code: 'INVALID_INPUT', message: '周报草稿无效' } };
    }
    reportService.discardDraft?.(draftId);
    return { ok: true, data: undefined };
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
    ipcMain.removeHandler(IPC.reportGenerate);
    ipcMain.removeHandler(IPC.reportCancel);
    ipcMain.removeHandler(IPC.reportSaveDraft);
    ipcMain.removeHandler(IPC.reportDiscardDraft);
    ipcMain.removeHandler(IPC.reportOpenLast);
    ipcMain.removeHandler(IPC.reportRevealLast);
  };
};
