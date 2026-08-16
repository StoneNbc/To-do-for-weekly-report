import type { IpcMain } from 'electron';
import type { ZodType } from 'zod';
import type { ApiErrorCode, ApiResult } from '../../shared/results';
import { IPC } from './channels';
import {
  contentSchema,
  isoDateSchema,
  isoWeekInputSchema,
  localTimeSchema,
  taskLocatorSchema,
} from './schemas';
import type { AppLogger } from '../logging/logger';
import type { TaskService } from '../services/taskService';
import type { WeeklyService } from '../services/weeklyService';
import { z } from 'zod';
import { getIsoWeekInfo } from '../../shared/dateUtils';

const editTodaySchema = z.object({
  locator: taskLocatorSchema,
  content: contentSchema,
  completedAt: localTimeSchema.optional(),
});
const addHistoricalSchema = z.object({
  date: isoDateSchema,
  content: contentSchema,
  completedAt: localTimeSchema.optional(),
});
const editHistoricalSchema = addHistoricalSchema.extend({ locator: taskLocatorSchema });
const deleteHistoricalSchema = z.object({ date: isoDateSchema, locator: taskLocatorSchema });

export interface BusinessServices {
  task: Pick<
    TaskService,
    'getToday' | 'addTodayTask' | 'toggleTodayTask' | 'editTodayTask' | 'deleteTodayTask'
  >;
  weekly: Pick<
    WeeklyService,
    'getDay' | 'addHistoricalTask' | 'editHistoricalTask' | 'deleteHistoricalTask' | 'getWeek'
  >;
}

export interface RegisterBusinessHandlersOptions {
  ipcMain: Pick<IpcMain, 'handle' | 'removeHandler'>;
  services: BusinessServices;
  logger: AppLogger;
  onAppWrite?: (scope: 'today' | 'week', revision: string) => void;
  onWeekAppWrite?: (isoYear: number, isoWeek: number, revision: string) => void;
}

const publicErrorCodes = new Set<ApiErrorCode>([
  'INVALID_INPUT',
  'FILE_CHANGED',
  'NOT_FOUND',
  'INVALID_FILE',
  'IO_ERROR',
  'CREDENTIAL_UNAVAILABLE',
  'NETWORK_POLICY_BLOCKED',
  'REMOTE_AUTH_FAILED',
  'REMOTE_RATE_LIMITED',
  'REMOTE_TIMEOUT',
  'REMOTE_RESPONSE_INVALID',
  'REMOTE_REQUEST_FAILED',
  'CANCELLED',
]);

export const toApiError = (error: unknown, logger: AppLogger): ApiResult<never> => {
  if (error instanceof z.ZodError || error instanceof RangeError) {
    return { ok: false, error: { code: 'INVALID_INPUT', message: '输入内容无效，请检查后重试' } };
  }

  if (error instanceof Error) {
    const candidate = 'code' in error && typeof error.code === 'string' ? error.code : undefined;
    if (candidate && publicErrorCodes.has(candidate as ApiErrorCode)) {
      return {
        ok: false,
        error: { code: candidate as ApiErrorCode, message: error.message || '操作失败' },
      };
    }
  }

  // 未知异常只写入脱敏日志，不把堆栈、路径等 Main 内部信息暴露给 Renderer。
  logger.error('Unhandled IPC operation error', { error });
  return { ok: false, error: { code: 'INTERNAL_ERROR', message: '操作失败，请稍后重试' } };
};

const parse = <T>(schema: ZodType<T>, input: unknown): T => schema.parse(input);

export const registerBusinessHandlers = ({
  ipcMain,
  services,
  logger,
  onAppWrite,
  onWeekAppWrite,
}: RegisterBusinessHandlersOptions): (() => void) => {
  const channels: string[] = [];
  // 统一包装成功/失败结果，保证所有业务通道具有相同的错误语义和卸载方式。
  const handle = <T>(channel: string, operation: (...args: unknown[]) => Promise<T>): void => {
    channels.push(channel);
    ipcMain.handle(channel, async (_event, ...args: unknown[]): Promise<ApiResult<T>> => {
      try {
        return { ok: true, data: await operation(...args) };
      } catch (error) {
        return toApiError(error, logger);
      }
    });
  };

  handle(IPC.todayGet, () => services.task.getToday());
  handle(IPC.todayAdd, async (input) => {
    const snapshot = await services.task.addTodayTask(parse(contentSchema, input));
    onAppWrite?.('today', snapshot.revision);
    return snapshot;
  });
  handle(IPC.todayToggle, async (input) => {
    const snapshot = await services.task.toggleTodayTask(parse(taskLocatorSchema, input));
    onAppWrite?.('today', snapshot.revision);
    return snapshot;
  });
  handle(IPC.todayEdit, async (input) => {
    const value = parse(editTodaySchema, input);
    const snapshot = await services.task.editTodayTask(
      value.locator,
      value.content,
      value.completedAt,
    );
    onAppWrite?.('today', snapshot.revision);
    return snapshot;
  });
  handle(IPC.todayDelete, async (input) => {
    const snapshot = await services.task.deleteTodayTask(parse(taskLocatorSchema, input));
    onAppWrite?.('today', snapshot.revision);
    return snapshot;
  });
  handle(IPC.historyGetDay, (input) => services.weekly.getDay(parse(isoDateSchema, input)));
  handle(IPC.historyAdd, async (input) => {
    const value = parse(addHistoricalSchema, input);
    const snapshot = await services.weekly.addHistoricalTask(value);
    // 先标记应用写入，再让 Watcher 事件抵达，可减少当前窗口的重复刷新。
    onAppWrite?.('week', snapshot.revision);
    const week = getIsoWeekInfo(value.date);
    onWeekAppWrite?.(week.isoYear, week.isoWeek, snapshot.revision);
    return snapshot;
  });
  handle(IPC.historyEdit, async (input) => {
    const value = parse(editHistoricalSchema, input);
    const snapshot = await services.weekly.editHistoricalTask(value);
    onAppWrite?.('week', snapshot.revision);
    const week = getIsoWeekInfo(value.date);
    onWeekAppWrite?.(week.isoYear, week.isoWeek, snapshot.revision);
    return snapshot;
  });
  handle(IPC.historyDelete, async (input) => {
    const value = parse(deleteHistoricalSchema, input);
    const snapshot = await services.weekly.deleteHistoricalTask(value);
    onAppWrite?.('week', snapshot.revision);
    const week = getIsoWeekInfo(value.date);
    onWeekAppWrite?.(week.isoYear, week.isoWeek, snapshot.revision);
    return snapshot;
  });
  handle(IPC.weekGet, (input) => {
    const value = parse(isoWeekInputSchema, input);
    return services.weekly.getWeek(value.isoYear, value.isoWeek);
  });

  // 测试和应用重建时可完整释放 handler，防止重复注册。
  return () => channels.forEach((channel) => ipcMain.removeHandler(channel));
};
