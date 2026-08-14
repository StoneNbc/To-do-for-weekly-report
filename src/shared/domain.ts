/**
 * Main、Preload 与 Renderer 共同使用的领域契约。
 *
 * 这些类型只描述跨进程数据形状，不承担运行时校验；所有 Renderer 传入的值仍须在
 * Main 的 IPC 边界通过 Zod 或 validation.ts 校验。
 */
export type IsoDate = string;
export type LocalTime = string;
export type FileRevision = string;

/** 使用文件 revision 与零基行号定位任务，避免同名任务被误操作。 */
export interface TaskLocator {
  line: number;
  revision: FileRevision;
}

/** 解析器发现非标准文本时返回给 UI/日志的非破坏性提示。 */
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
  /** today.txt 头部声明的日期，可能因应用跨日未运行而早于 currentDate。 */
  fileDate: IsoDate;
  /** Main Process 当前本地日期。 */
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
  /** 周文件不存在时为 null，不能用空字符串代替。 */
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

/** ReportAgent 的稳定扩展点；具体 Agent 不应负责文件选择或磁盘写入。 */
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
  /** 保留未知字段，使未来版本或用户手写配置不会在当前版本中被静默删除。 */
  [key: string]: unknown;
}

/** Main 广播给所有窗口的失效通知，窗口收到后自行拉取最新快照。 */
export interface DataChangedEvent {
  scope: 'today' | 'week' | 'config';
  isoYear?: number;
  isoWeek?: number;
  reason: 'external-edit' | 'app-write' | 'archive' | 'history-edit';
}
