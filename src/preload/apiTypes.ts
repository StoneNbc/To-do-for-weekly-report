import type {
  DataChangedEvent,
  DayRecordSnapshot,
  LocalTime,
  TaskLocator,
  TodaySnapshot,
  WeeklySnapshot,
  AppearancePreview,
  SettingsPatch,
  SettingsSnapshot,
  NoteAppearance,
  ReportDraft,
  LlmConnectionTestInput,
  ReportSettingsPatch,
  ReportSettingsSnapshot,
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
    generate(input: IsoWeekInput & { requestId: string }): Promise<ApiResult<ReportDraft>>;
    cancel(requestId: string): Promise<ApiResult<void>>;
    saveDraft(input: { draftId: string; content: string }): Promise<ExportReportResult>;
    discardDraft(draftId: string): Promise<ApiResult<void>>;
    openLast(): Promise<ApiResult<void>>;
    revealLast(): Promise<ApiResult<void>>;
  };
  window: {
    openWeekly(): Promise<void>;
    generateCurrentWeekReport(): Promise<void>;
    showNote(): Promise<void>;
    openSettings(): Promise<void>;
    setSettingsDirty(dirty: boolean): Promise<void>;
    discardSettingsChangesAndClose(): Promise<void>;
  };
  app: {
    openDataFolder(): Promise<void>;
    setAlwaysOnTop(enabled: boolean): Promise<ApiResult<void>>;
    quit(): Promise<void>;
  };
  settings: {
    get(): Promise<ApiResult<SettingsSnapshot>>;
    previewAppearance(input: AppearancePreview): Promise<ApiResult<void>>;
    update(input: SettingsPatch): Promise<ApiResult<SettingsSnapshot>>;
    resetAppearance(): Promise<ApiResult<SettingsSnapshot>>;
    openLogsFolder(): Promise<ApiResult<void>>;
    copyDataPath(): Promise<ApiResult<void>>;
  };
  reportSettings: {
    get(): Promise<ApiResult<ReportSettingsSnapshot>>;
    preview(template: string): Promise<ApiResult<string>>;
    getDefaultText(
      kind: 'record-template' | 'remote-template' | 'prompt',
    ): Promise<ApiResult<string>>;
    save(input: ReportSettingsPatch): Promise<ApiResult<ReportSettingsSnapshot>>;
    testConnection(input: LlmConnectionTestInput): Promise<ApiResult<string>>;
    confirmConsent(): Promise<ApiResult<ReportSettingsSnapshot>>;
  };
  events: {
    /** 返回退订函数，React effect 卸载时必须调用，防止重复监听。 */
    onDataChanged(listener: (event: DataChangedEvent) => void): () => void;
    onSettingsChanged(listener: (snapshot: SettingsSnapshot) => void): () => void;
    onAppearancePreviewed(listener: (appearance: NoteAppearance) => void): () => void;
    onReportGenerationRequested(listener: () => void): () => void;
    onSettingsCloseRequested(listener: () => void): () => void;
  };
}
