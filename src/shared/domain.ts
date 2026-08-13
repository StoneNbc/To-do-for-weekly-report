export type IsoDate = string;
export type LocalTime = string;
export type FileRevision = string;

export interface TaskLocator {
  line: number;
  revision: FileRevision;
}

export interface ParseWarning {
  file: string;
  line: number;
  code:
    | 'UNKNOWN_LINE'
    | 'INVALID_HEADER'
    | 'INVALID_DATE'
    | 'ORPHAN_TASK'
    | 'INVALID_TIME'
    | 'DUPLICATE_HEADER';
  reason: string;
}

export interface TodayTaskView {
  locator: TaskLocator;
  content: string;
  completed: boolean;
  completedAt?: LocalTime;
}

export interface HistoricalTaskView {
  locator: TaskLocator;
  date: IsoDate;
  content: string;
  completedAt?: LocalTime;
}

export interface TodaySnapshot {
  fileDate: IsoDate;
  currentDate: IsoDate;
  revision: FileRevision;
  tasks: TodayTaskView[];
  warnings: ParseWarning[];
}

export interface DayRecordSnapshot {
  date: IsoDate;
  revision: FileRevision;
  tasks: HistoricalTaskView[];
  warnings: ParseWarning[];
}

export interface WeeklyTask {
  date: IsoDate;
  content: string;
  time?: LocalTime;
}

export interface WeeklyDayGroup {
  date: IsoDate;
  weekdayLabel: string;
  tasks: WeeklyTask[];
}

export interface WeeklySnapshot {
  isoYear: number;
  isoWeek: number;
  weekStart: IsoDate;
  weekEnd: IsoDate;
  revision: FileRevision | null;
  groups: WeeklyDayGroup[];
  total: number;
}

export interface ReportContext {
  isoYear: number;
  isoWeek: number;
  weekStart: IsoDate;
  weekEnd: IsoDate;
}

export interface ReportAgent {
  readonly name: string;
  isAvailable(): Promise<boolean>;
  generateReport(tasks: WeeklyTask[], context: ReportContext): Promise<string>;
}

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AppConfig {
  schema_version: 1;
  cleanup_time: '00:00';
  agent: string;
  template_path: string | null;
  always_on_top: boolean;
  window_bounds: WindowBounds | null;
  completed_expanded: boolean;
  [key: string]: unknown;
}

export interface DataChangedEvent {
  scope: 'today' | 'week' | 'config';
  isoYear?: number;
  isoWeek?: number;
  reason: 'external-edit' | 'app-write' | 'archive' | 'history-edit';
}
