import type {
  DataChangedEvent,
  DayRecordSnapshot,
  LocalTime,
  TaskLocator,
  TodaySnapshot,
  WeeklySnapshot,
} from '../shared/domain';
import type { ApiResult, ExportReportResult } from '../shared/results';

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
    onDataChanged(listener: (event: DataChangedEvent) => void): () => void;
  };
}
