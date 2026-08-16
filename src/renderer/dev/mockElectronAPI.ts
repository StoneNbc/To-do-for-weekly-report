import type { ElectronAPI } from '../../preload/apiTypes';
import type {
  DataChangedEvent,
  DayRecordSnapshot,
  SettingsPatch,
  SettingsSnapshot,
  NoteAppearance,
  ReportDraft,
  ReportSettingsPatch,
  ReportSettingsSnapshot,
  TodaySnapshot,
  WeeklySnapshot,
} from '../../shared/domain';
import type { ApiResult, ExportReportResult } from '../../shared/results';
import {
  DEFAULT_LLM_SETTINGS,
  DEFAULT_REMOTE_REPORT_TEMPLATE,
  DEFAULT_REPORT_PROMPT,
  DEFAULT_REPORT_TEMPLATE,
} from '../../shared/constants';

// 仅供 Renderer 测试显式注入；生产入口绝不能在 Preload 缺失时自动回退到该 Mock。
export type MockScenario =
  'default' | 'empty-week' | 'file-changed' | 'io-error' | 'export-cancelled';

const clone = <T>(value: T): T => structuredClone(value);
const pause = () => Promise.resolve();
const locator = (line: number, revision = 'today-r1') => ({ line, revision });

export const mockTodaySnapshot: TodaySnapshot = {
  fileDate: '2026-08-13',
  currentDate: '2026-08-13',
  revision: 'today-r1',
  tasks: [
    { locator: locator(1), content: '准备周会材料', completed: false },
    { locator: locator(2), content: '回复客户邮件', completed: true, completedAt: '14:20' },
    { locator: locator(3), content: '重复记录', completed: true, completedAt: '09:30' },
    { locator: locator(4), content: '重复记录', completed: true, completedAt: '09:30' },
    { locator: locator(5), content: '整理需求列表', completed: true, completedAt: '16:05' },
    { locator: locator(6), content: '补充测试场景', completed: true, completedAt: '17:10' },
  ],
  warnings: [],
};

export const mockHistoricalSnapshot: DayRecordSnapshot = {
  date: '2026-08-12',
  revision: 'week-r1',
  tasks: [
    {
      locator: locator(4, 'week-r1'),
      date: '2026-08-12',
      content: '完成界面原型',
      completedAt: '15:30',
    },
  ],
  warnings: [],
};

export const mockWeeklySnapshot: WeeklySnapshot = {
  isoYear: 2026,
  isoWeek: 33,
  weekStart: '2026-08-10',
  weekEnd: '2026-08-16',
  revision: 'week-r1',
  groups: [
    {
      date: '2026-08-12',
      weekdayLabel: '周三',
      tasks: [
        { date: '2026-08-12', content: '完成界面原型', time: '15:30' },
        { date: '2026-08-12', content: '重复记录', time: '09:30' },
        { date: '2026-08-12', content: '重复记录', time: '09:30' },
      ],
    },
  ],
  total: 3,
};

export interface MockElectronAPIController {
  api: ElectronAPI;
  emit(event: DataChangedEvent): void;
  emitSettings(snapshot?: SettingsSnapshot): void;
  emitSettingsCloseRequested(): void;
}

export function createMockElectronAPI(
  scenario: MockScenario = 'default',
): MockElectronAPIController {
  let today = clone(mockTodaySnapshot);
  let history = clone(mockHistoricalSnapshot);
  let settings: SettingsSnapshot = {
    noteColor: '#FFF8E7',
    noteOpacity: 1,
    alwaysOnTop: true,
    completedExpanded: false,
    dataDirectory: '/本机/悬浮便利贴/data',
  };
  let reportSettings: ReportSettingsSnapshot = {
    mode: 'local-template',
    recordTemplate: DEFAULT_REPORT_TEMPLATE,
    remoteTemplate: DEFAULT_REMOTE_REPORT_TEMPLATE,
    prompt: DEFAULT_REPORT_PROMPT,
    llm: clone(DEFAULT_LLM_SETTINGS),
    hasApiKey: false,
    apiKeyMask: null,
    remoteConsentConfirmed: false,
  };
  let revisionSequence = 1;
  const listeners = new Set<(event: DataChangedEvent) => void>();
  const settingsListeners = new Set<(snapshot: SettingsSnapshot) => void>();
  const appearanceListeners = new Set<(appearance: NoteAppearance) => void>();
  const reportGenerationListeners = new Set<() => void>();
  const settingsCloseListeners = new Set<() => void>();

  const nextTodaySnapshot = (tasks: TodaySnapshot['tasks']): TodaySnapshot => {
    const revision = `today-r-wave2-${revisionSequence++}`;
    return {
      ...today,
      revision,
      tasks: tasks.map((task) => ({ ...task, locator: { ...task.locator, revision } })),
    };
  };

  const nextHistorySnapshot = (
    tasks: DayRecordSnapshot['tasks'],
    date = history.date,
  ): DayRecordSnapshot => {
    const revision = `week-r-wave2-${revisionSequence++}`;
    return {
      ...history,
      date,
      revision,
      tasks: tasks.map((task) => ({ ...task, locator: { ...task.locator, revision } })),
    };
  };

  const failureForScenario = <T>(): ApiResult<T> | null => {
    if (scenario === 'file-changed') {
      return { ok: false, error: { code: 'FILE_CHANGED', message: '数据文件已更新，请重试' } };
    }
    if (scenario === 'io-error') {
      return { ok: false, error: { code: 'IO_ERROR', message: '暂时无法读写本地文件' } };
    }
    return null;
  };

  const api = {
    async healthCheck() {
      return { status: 'ok' as const };
    },
    today: {
      async get() {
        await pause();
        if (scenario === 'io-error') return failureForScenario<TodaySnapshot>()!;
        return { ok: true as const, data: clone(today) };
      },
      async add(content: string) {
        const failure = failureForScenario<TodaySnapshot>();
        if (failure) return failure;
        today = nextTodaySnapshot([
          ...today.tasks,
          { locator: locator(today.tasks.length + 1, today.revision), content, completed: false },
        ]);
        return { ok: true as const, data: clone(today) };
      },
      async toggle(target: { line: number; revision: string }) {
        const failure = failureForScenario<TodaySnapshot>();
        if (failure) return failure;
        today = nextTodaySnapshot(
          today.tasks.map((task) =>
            task.locator.line === target.line
              ? task.completed
                ? { locator: task.locator, content: task.content, completed: false }
                : { ...task, completed: true, completedAt: '18:20' }
              : task,
          ),
        );
        return { ok: true as const, data: clone(today) };
      },
      async edit(input: {
        locator: { line: number; revision: string };
        content: string;
        completedAt?: string;
      }) {
        const failure = failureForScenario<TodaySnapshot>();
        if (failure) return failure;
        today = nextTodaySnapshot(
          today.tasks.map((task) =>
            task.locator.line === input.locator.line
              ? input.completedAt
                ? { ...task, content: input.content, completedAt: input.completedAt }
                : { ...task, content: input.content }
              : task,
          ),
        );
        return { ok: true as const, data: clone(today) };
      },
      async delete(target: { line: number; revision: string }) {
        const failure = failureForScenario<TodaySnapshot>();
        if (failure) return failure;
        today = nextTodaySnapshot(today.tasks.filter((task) => task.locator.line !== target.line));
        return { ok: true as const, data: clone(today) };
      },
    },
    history: {
      async getDay(date: string) {
        await pause();
        if (scenario === 'io-error') return failureForScenario<DayRecordSnapshot>()!;
        return {
          ok: true as const,
          data:
            date === history.date
              ? clone(history)
              : { date, revision: 'empty-week', tasks: [], warnings: [] },
        };
      },
      async add(input: { date: string; content: string; completedAt?: string }) {
        const failure = failureForScenario<DayRecordSnapshot>();
        if (failure) return failure;
        const task = input.completedAt
          ? {
              locator: locator(history.tasks.length + 5, history.revision),
              date: input.date,
              content: input.content,
              completedAt: input.completedAt,
            }
          : {
              locator: locator(history.tasks.length + 5, history.revision),
              date: input.date,
              content: input.content,
            };
        history = nextHistorySnapshot([...history.tasks, task], input.date);
        return { ok: true as const, data: clone(history) };
      },
      async edit(input: {
        date: string;
        locator: { line: number; revision: string };
        content: string;
        completedAt?: string;
      }) {
        const failure = failureForScenario<DayRecordSnapshot>();
        if (failure) return failure;
        history = nextHistorySnapshot(
          history.tasks.map((task) =>
            task.locator.line === input.locator.line
              ? input.completedAt
                ? { ...task, content: input.content, completedAt: input.completedAt }
                : { locator: task.locator, date: task.date, content: input.content }
              : task,
          ),
        );
        return { ok: true as const, data: clone(history) };
      },
      async delete(input: { date: string; locator: { line: number; revision: string } }) {
        const failure = failureForScenario<DayRecordSnapshot>();
        if (failure) return failure;
        history = nextHistorySnapshot(
          history.tasks.filter((task) => task.locator.line !== input.locator.line),
        );
        return { ok: true as const, data: clone(history) };
      },
    },
    week: {
      async get(input: { isoYear: number; isoWeek: number }) {
        await pause();
        if (scenario === 'io-error') return failureForScenario<WeeklySnapshot>()!;
        const snapshot =
          scenario === 'empty-week'
            ? { ...mockWeeklySnapshot, ...input, groups: [], total: 0 }
            : { ...mockWeeklySnapshot, ...input };
        return { ok: true as const, data: clone(snapshot) };
      },
    },
    report: {
      async export(): Promise<ExportReportResult> {
        if (scenario === 'export-cancelled') return { status: 'cancelled' };
        if (scenario === 'io-error') return { status: 'failed', message: '报告写入失败' };
        return { status: 'saved', path: '/用户选择/周报-2026年第33周.txt' };
      },
      async openLast() {
        return { ok: true as const, data: undefined };
      },
      async revealLast() {
        return { ok: true as const, data: undefined };
      },
      async generate(): Promise<ApiResult<ReportDraft>> {
        return {
          ok: true,
          data: {
            id: 'a7bfe42a-1245-4bb9-b854-4ebf8b8c6b3c',
            content: '模拟生成的周报内容',
            mode: reportSettings.mode,
            createdAt: new Date().toISOString(),
          },
        };
      },
      async cancel() {
        return { ok: true as const, data: undefined };
      },
      async saveDraft(): Promise<ExportReportResult> {
        return this.export({ isoYear: 2026, isoWeek: 33 });
      },
      async discardDraft() {
        return { ok: true as const, data: undefined };
      },
    },
    window: {
      async openWeekly() {},
      async generateCurrentWeekReport() {},
      async showNote() {},
      async openSettings() {},
      async setSettingsDirty() {},
      async discardSettingsChangesAndClose() {},
    },
    app: {
      async openDataFolder() {},
      async setAlwaysOnTop() {
        return { ok: true as const, data: undefined };
      },
      async quit() {},
    },
    settings: {
      async get() {
        if (scenario === 'io-error') return failureForScenario<SettingsSnapshot>()!;
        return { ok: true as const, data: clone(settings) };
      },
      async previewAppearance(input) {
        if (scenario === 'io-error') return failureForScenario<void>()!;
        const appearance = {
          noteColor: input.noteColor ?? settings.noteColor,
          noteOpacity: input.noteOpacity ?? settings.noteOpacity,
        };
        appearanceListeners.forEach((listener) => listener(clone(appearance)));
        return { ok: true as const, data: undefined };
      },
      async update(input: SettingsPatch) {
        if (scenario === 'io-error') return failureForScenario<SettingsSnapshot>()!;
        settings = {
          ...settings,
          ...(input.noteColor !== undefined ? { noteColor: input.noteColor } : {}),
          ...(input.noteOpacity !== undefined ? { noteOpacity: input.noteOpacity } : {}),
          ...(input.alwaysOnTop !== undefined ? { alwaysOnTop: input.alwaysOnTop } : {}),
          ...(input.completedExpanded !== undefined
            ? { completedExpanded: input.completedExpanded }
            : {}),
        };
        settingsListeners.forEach((listener) => listener(clone(settings)));
        return { ok: true as const, data: clone(settings) };
      },
      async resetAppearance() {
        if (scenario === 'io-error') return failureForScenario<SettingsSnapshot>()!;
        settings = { ...settings, noteColor: '#FFF8E7', noteOpacity: 1 };
        settingsListeners.forEach((listener) => listener(clone(settings)));
        return { ok: true as const, data: clone(settings) };
      },
      async openLogsFolder() {
        if (scenario === 'io-error') return failureForScenario<void>()!;
        return { ok: true as const, data: undefined };
      },
      async copyDataPath() {
        if (scenario === 'io-error') return failureForScenario<void>()!;
        return { ok: true as const, data: undefined };
      },
    },
    reportSettings: {
      async get() {
        return { ok: true as const, data: clone(reportSettings) };
      },
      async preview(template: string) {
        if (!template.includes('{{tasks}}')) {
          return {
            ok: false as const,
            error: { code: 'INVALID_INPUT' as const, message: '模板必须包含 {{tasks}}' },
          };
        }
        return { ok: true as const, data: template.replace('{{tasks}}', '- 示例任务') };
      },
      async getDefaultText(kind) {
        const data =
          kind === 'remote-template'
            ? DEFAULT_REMOTE_REPORT_TEMPLATE
            : kind === 'prompt'
              ? DEFAULT_REPORT_PROMPT
              : DEFAULT_REPORT_TEMPLATE;
        return { ok: true as const, data };
      },
      async save(input: ReportSettingsPatch) {
        reportSettings = {
          ...reportSettings,
          mode: input.mode,
          recordTemplate: input.recordTemplate,
          remoteTemplate: input.remoteTemplate,
          prompt: input.prompt,
          llm: clone(input.llm),
          hasApiKey: input.apiKey ? true : reportSettings.hasApiKey,
          apiKeyMask: input.apiKey ? 'sk-••••mock' : reportSettings.apiKeyMask,
        };
        return { ok: true as const, data: clone(reportSettings) };
      },
      async testConnection() {
        return { ok: true as const, data: '连接成功' };
      },
      async confirmConsent() {
        reportSettings = { ...reportSettings, remoteConsentConfirmed: true };
        return { ok: true as const, data: clone(reportSettings) };
      },
    },
    events: {
      onDataChanged(listener: (event: DataChangedEvent) => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      onSettingsChanged(listener: (snapshot: SettingsSnapshot) => void) {
        settingsListeners.add(listener);
        return () => settingsListeners.delete(listener);
      },
      onAppearancePreviewed(listener: (appearance: NoteAppearance) => void) {
        appearanceListeners.add(listener);
        return () => appearanceListeners.delete(listener);
      },
      onReportGenerationRequested(listener: () => void) {
        reportGenerationListeners.add(listener);
        return () => reportGenerationListeners.delete(listener);
      },
      onSettingsCloseRequested(listener: () => void) {
        settingsCloseListeners.add(listener);
        return () => settingsCloseListeners.delete(listener);
      },
    },
  } satisfies ElectronAPI;

  return {
    api,
    emit(event) {
      listeners.forEach((listener) => listener(event));
    },
    emitSettings(snapshot = settings) {
      settings = clone(snapshot);
      settingsListeners.forEach((listener) => listener(clone(settings)));
    },
    emitSettingsCloseRequested() {
      settingsCloseListeners.forEach((listener) => listener());
    },
  };
}
