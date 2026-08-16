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

export type ReportGenerationMode = 'local-template' | 'remote-llm';
export type LlmProviderId = 'deepseek' | 'qwen' | 'kimi' | 'zhipu' | 'local' | 'custom';

export interface LlmConnectionSettings {
  provider: LlmProviderId;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
  /** 明确允许向非回环地址使用明文 HTTP；默认 false。 */
  allowInsecureHttp: boolean;
}

export interface ReportGenerationOptions {
  signal?: AbortSignal | undefined;
  /** 作为远程周报“下周计划”的候选来源；本地模板 Agent 忽略此字段。 */
  pendingTasks?: string[] | undefined;
}

/** ReportAgent 的稳定扩展点；具体 Agent 不应负责文件选择或磁盘写入。 */
export interface ReportAgent {
  readonly name: string;
  isAvailable(): Promise<boolean>;
  generateReport(
    tasks: WeeklyTask[],
    context: ReportContext,
    options?: ReportGenerationOptions,
  ): Promise<string>;
}

export interface ReportDraft {
  id: string;
  content: string;
  mode: ReportGenerationMode;
  createdAt: string;
}

export interface ReportSettingsSnapshot {
  mode: ReportGenerationMode;
  recordTemplate: string;
  remoteTemplate: string;
  prompt: string;
  llm: LlmConnectionSettings;
  hasApiKey: boolean;
  apiKeyMask: string | null;
  remoteConsentConfirmed: boolean;
}

export interface ReportSettingsPatch {
  mode: ReportGenerationMode;
  recordTemplate: string;
  remoteTemplate: string;
  prompt: string;
  llm: LlmConnectionSettings;
  /** undefined 表示保留原凭据，空字符串表示删除，其他值表示替换。 */
  apiKey?: string | undefined;
}

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AppConfig {
  schema_version: 2;
  cleanup_time: '00:00';
  agent: 'template' | 'openai-compatible';
  template_path: string | null;
  remote_template_path: string | null;
  report_prompt_path: string | null;
  llm: LlmConnectionSettings;
  remote_consent_confirmed: boolean;
  always_on_top: boolean;
  window_bounds: WindowBounds | null;
  completed_expanded: boolean;
  note_color: string;
  note_opacity: number;
  /** 保留未知字段，使未来版本或用户手写配置不会在当前版本中被静默删除。 */
  [key: string]: unknown;
}

/** Renderer 只读取可公开设置，不暴露完整 AppConfig 或内部路径字段。 */
export interface SettingsSnapshot {
  noteColor: string;
  noteOpacity: number;
  alwaysOnTop: boolean;
  completedExpanded: boolean;
  dataDirectory: string;
}

export interface SettingsPatch {
  noteColor?: string | undefined;
  noteOpacity?: number | undefined;
  alwaysOnTop?: boolean | undefined;
  completedExpanded?: boolean | undefined;
}

export interface AppearancePreview {
  noteColor?: string | undefined;
  noteOpacity?: number | undefined;
}

export interface NoteAppearance {
  noteColor: string;
  noteOpacity: number;
}

/** Main 广播给所有窗口的失效通知，窗口收到后自行拉取最新快照。 */
export interface DataChangedEvent {
  scope: 'today' | 'week' | 'config';
  isoYear?: number;
  isoWeek?: number;
  reason: 'external-edit' | 'app-write' | 'archive' | 'history-edit';
}
