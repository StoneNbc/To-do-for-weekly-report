import type {
  DataChangedEvent,
  DayRecordSnapshot,
  LocalTime,
  TaskLocator,
  TodaySnapshot,
  WeeklySnapshot,
} from '../shared/domain';
import type { ApiResult, ExportReportResult } from '../shared/results';

/** IPC 使用的 ISO 周参数，年份采用 ISO 周年而不是日期的自然年。 */
export interface IsoWeekInput {
  isoYear: number;
  isoWeek: number;
}

export interface EditTodayInput {
  locator: TaskLocator;
  content: string;
  completedAt?: LocalTime;
}

export interface AddHistoricalInput {
  date: string;
  content: string;
  completedAt?: LocalTime;
}

export interface EditHistoricalInput extends AddHistoricalInput {
  locator: TaskLocator;
}

export interface DeleteHistoricalInput {
  date: string;
  locator: TaskLocator;
}

/**
 * contextBridge 暴露的最小权限 API。
 * Renderer 不得绕过它直接 import Electron、Node 或 Main Process 模块。
 */
export interface ElectronAPI {
  healthCheck(): Promise<{ status: 'ok' }>;
  today: {
    get(): Promise<ApiResult<TodaySnapshot>>;
    add(content: string): Promise<ApiResult<TodaySnapshot>>;
    toggle(locator: TaskLocator): Promise<ApiResult<TodaySnapshot>>;
    edit(input: EditTodayInput): Promise<ApiResult<TodaySnapshot>>;
    delete(locator: TaskLocator): Promise<ApiResult<TodaySnapshot>>;
  };
  history: {
    getDay(date: string): Promise<ApiResult<DayRecordSnapshot>>;
    add(input: AddHistoricalInput): Promise<ApiResult<DayRecordSnapshot>>;
    edit(input: EditHistoricalInput): Promise<ApiResult<DayRecordSnapshot>>;
    delete(input: DeleteHistoricalInput): Promise<ApiResult<DayRecordSnapshot>>;
  };
  week: {
    get(input: IsoWeekInput): Promise<ApiResult<WeeklySnapshot>>;
  };
  report: {
    export(input: IsoWeekInput): Promise<ExportReportResult>;
    openLast(): Promise<ApiResult<void>>;
    revealLast(): Promise<ApiResult<void>>;
  };
  window: {
    openWeekly(): Promise<void>;
    showNote(): Promise<void>;
  };
  app: {
    openDataFolder(): Promise<void>;
    setAlwaysOnTop(enabled: boolean): Promise<ApiResult<void>>;
    quit(): Promise<void>;
  };
  events: {
    /** 返回退订函数，React effect 卸载时必须调用，防止重复监听。 */
    onDataChanged(listener: (event: DataChangedEvent) => void): () => void;
  };
}
