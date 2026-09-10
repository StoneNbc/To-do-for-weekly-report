import { createMockProjectAPI } from './mockProjectAPI';
import type { MoveTasksInput } from '../../shared/projects';
/**
 * Renderer 测试用的 ElectronAPI 内存 Mock。
 * 模拟 Main Process 的任务、历史、周记、设置和报告等操作，
 * 支持多种场景（空周、文件冲突、IO 错误、导出取消等），
 * 供组件测试通过 Provider 显式注入。生产环境绝不能使用此 Mock。
 */
import type { ElectronAPI } from '../../preload/apiTypes';
import type {
  DataChangedEvent,
  DayRecordSnapshot,
  SettingsPatch,
  SettingsSnapshot,
  NoteAppearance,
  NoteDockSnapshot,
  NoteInteractionState,
  ReportDraft,
  ReportSettingsPatch,
  ReportSettingsSnapshot,
  TodaySnapshot,
  HistoryViewSnapshot,
  WeeklySnapshot,
} from '../../shared/domain';
import type { ApiResult, ExportReportResult } from '../../shared/results';
import {
  DEFAULT_EDGE_REVEAL_COLOR,
  DEFAULT_NOTE_COLOR,
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
    {
      locator: locator(1),
      content: '准备周会材料',
      details: '确认议程\n整理上周遗留问题',
      completed: false,
      addedDate: '2026-08-10',
    },
    {
      locator: locator(2),
      content: '回复客户邮件',
      details: '',
      completed: true,
      completedAt: '14:20',
    },
    {
      locator: locator(3),
      content: '重复记录',
      details: '',
      completed: true,
      completedAt: '09:30',
    },
    {
      locator: locator(4),
      content: '重复记录',
      details: '',
      completed: true,
      completedAt: '09:30',
    },
    {
      locator: locator(5),
      content: '整理需求列表',
      details: '',
      completed: true,
      completedAt: '16:05',
    },
    {
      locator: locator(6),
      content: '补充测试场景',
      details: '',
      completed: true,
      completedAt: '17:10',
    },
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
      details: '核对最小窗口布局',
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

/** Mock 控制器：除了返回 api 外，还提供手动触发事件的方法，用于测试事件驱动场景。 */
export interface MockElectronAPIController {
  api: ElectronAPI;
  emit(event: DataChangedEvent): void;
  emitSettings(snapshot?: SettingsSnapshot): void;
  emitSettingsCloseRequested(): void;
  emitNoteDockState(snapshot: NoteDockSnapshot): void;
  getLastNoteInteractionState(): NoteInteractionState;
}

/** 根据指定场景创建 Mock ElectronAPI 及其事件控制器。 */
export function createMockElectronAPI(
  scenario: MockScenario = 'default',
): MockElectronAPIController {
  let today = clone(mockTodaySnapshot);
  let history = clone(mockHistoricalSnapshot);
  let settings: SettingsSnapshot = {
    noteColor: '#FFF8E7',
    noteOpacity: 1,
    alwaysOnTop: true,
    showOnFullScreen: true,
    edgeAutoHideEnabled: false,
    edgeRevealColor: DEFAULT_EDGE_REVEAL_COLOR,
    completedExpanded: false,
    addedDateDisplay: 'hover',
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
  const projectCreatedListeners = new Set<(name: string) => void>();
  let projectCreateOpen = false;
  const listeners = new Set<(event: DataChangedEvent) => void>();
  const settingsListeners = new Set<(snapshot: SettingsSnapshot) => void>();
  const appearanceListeners = new Set<(appearance: NoteAppearance) => void>();
  const reportGenerationListeners = new Set<() => void>();
  const settingsCloseListeners = new Set<() => void>();
  const noteDockListeners = new Set<(snapshot: NoteDockSnapshot) => void>();
  let noteDockState: NoteDockSnapshot = { edge: null, phase: 'undocked' };
  let noteInteractionState: NoteInteractionState = {
    pointerInside: false,
    autoHideBlocked: false,
  };

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

  const historyView = (date: string): HistoryViewSnapshot => ({
    date,
    backlog: {
      ...clone(today),
      tasks: today.tasks.filter(
        (task) =>
          !task.completed &&
          (task.addedDate === undefined || task.addedDate.localeCompare(date) <= 0),
      ),
    },
    completed:
      date === history.date
        ? clone(history)
        : { date, revision: 'empty-week', tasks: [], warnings: [] },
  });

  let noteCollapsed = false;
  const projects = createMockProjectAPI({
    today: () => today,
    history: () => history,
    setToday: (value) => {
      today = nextTodaySnapshot(value.tasks);
    },
    setHistory: (value) => {
      history = nextHistorySnapshot(value.tasks);
    },
    changed: () =>
      listeners.forEach((listener) => listener({ scope: 'projects', reason: 'app-write' })),
  });
  const api = {
    projects: {
      ...projects,
      async create(input) {
        const result = await projects.create(input);
        if (result.ok && projectCreateOpen)
          projectCreatedListeners.forEach((listener) => listener(input.name.trim()));
        return result;
      },
    },
    async healthCheck() {
      return { status: 'ok' as const };
    },
    today: {
      async get() {
        await pause();
        if (scenario === 'io-error') return failureForScenario<TodaySnapshot>()!;
        return { ok: true as const, data: clone(today) };
      },
      async add(content: string, projectName?: string | null) {
        const failure = failureForScenario<TodaySnapshot>();
        if (failure) return failure;
        today = nextTodaySnapshot([
          ...today.tasks,
          {
            locator: locator(today.tasks.length + 1, today.revision),
            content,
            ...(projectName != null ? { projectName } : {}),
            details: '',
            completed: false,
          },
        ]);
        return { ok: true as const, data: clone(today) };
      },
      async moveMany(input: MoveTasksInput) {
        if (input.locators.some((locator) => locator.revision !== today.revision))
          return {
            ok: false as const,
            error: { code: 'FILE_CHANGED' as const, message: '数据已更新' },
          };
        today = nextTodaySnapshot(
          today.tasks.map((task) =>
            input.locators.some((locator) => locator.line === task.locator.line)
              ? { ...task, projectName: input.projectName }
              : task,
          ),
        );
        return { ok: true as const, data: clone(today) };
      },
      async toggle(target: { line: number; revision: string }) {
        const failure = failureForScenario<TodaySnapshot>();
        if (failure) return failure;
        today = nextTodaySnapshot(
          today.tasks.map((task) =>
            task.locator.line === target.line
              ? task.completed
                ? (() => {
                    const pending = { ...task };
                    delete pending.completedAt;
                    return { ...pending, completed: false };
                  })()
                : { ...task, completed: true, completedAt: '18:20' }
              : task,
          ),
        );
        return { ok: true as const, data: clone(today) };
      },
      async edit(input: {
        locator: { line: number; revision: string };
        content: string;
        details: string;
        projectName?: string | null | undefined;
        completedAt?: string;
      }) {
        const failure = failureForScenario<TodaySnapshot>();
        if (failure) return failure;
        today = nextTodaySnapshot(
          today.tasks.map((task) =>
            task.locator.line === input.locator.line
              ? input.completedAt
                ? {
                    ...task,
                    content: input.content,
                    ...(input.projectName !== undefined ? { projectName: input.projectName } : {}),
                    details: input.details,
                    completedAt: input.completedAt,
                  }
                : {
                    ...task,
                    content: input.content,
                    ...(input.projectName !== undefined ? { projectName: input.projectName } : {}),
                    details: input.details,
                  }
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
      async getView(date: string) {
        await pause();
        if (scenario === 'io-error') return failureForScenario<HistoryViewSnapshot>()!;
        return { ok: true as const, data: historyView(date) };
      },
      async addPending(input: {
        date: string;
        content: string;
        projectName?: string | null | undefined;
      }) {
        const failure = failureForScenario<HistoryViewSnapshot>();
        if (failure) return failure;
        today = nextTodaySnapshot([
          ...today.tasks,
          {
            locator: locator(today.tasks.length + 1, today.revision),
            content: input.content,
            ...(input.projectName !== undefined ? { projectName: input.projectName } : {}),
            details: '',
            completed: false,
            addedDate: input.date,
          },
        ]);
        return { ok: true as const, data: historyView(input.date) };
      },
      async editPending(input: {
        date: string;
        locator: { line: number; revision: string };
        content: string;
        details: string;
        projectName?: string | null | undefined;
      }) {
        const failure = failureForScenario<HistoryViewSnapshot>();
        if (failure) return failure;
        today = nextTodaySnapshot(
          today.tasks.map((task) =>
            task.locator.line === input.locator.line
              ? {
                  ...task,
                  content: input.content,
                  ...(input.projectName !== undefined ? { projectName: input.projectName } : {}),
                  details: input.details,
                }
              : task,
          ),
        );
        return { ok: true as const, data: historyView(input.date) };
      },
      async deletePending(input: { date: string; locator: { line: number; revision: string } }) {
        const failure = failureForScenario<HistoryViewSnapshot>();
        if (failure) return failure;
        today = nextTodaySnapshot(
          today.tasks.filter((task) => task.locator.line !== input.locator.line),
        );
        return { ok: true as const, data: historyView(input.date) };
      },
      async completePending(input: { date: string; locator: { line: number; revision: string } }) {
        const failure = failureForScenario<HistoryViewSnapshot>();
        if (failure) return failure;
        const task = today.tasks.find(
          (candidate) => candidate.locator.line === input.locator.line,
        )!;
        today = nextTodaySnapshot(
          today.tasks.filter((candidate) => candidate.locator.line !== input.locator.line),
        );
        history = nextHistorySnapshot(
          [
            ...history.tasks,
            {
              locator: locator(history.tasks.length + 5, history.revision),
              date: input.date,
              content: task.content,
              ...(task.projectName != null ? { projectName: task.projectName } : {}),
              ...(task.projectName != null ? { projectName: task.projectName } : {}),
              details: task.details,
              ...(task.addedDate ? { addedDate: task.addedDate } : {}),
            },
          ],
          input.date,
        );
        return { ok: true as const, data: historyView(input.date) };
      },
      async reopenCompleted(input: { date: string; locator: { line: number; revision: string } }) {
        const failure = failureForScenario<HistoryViewSnapshot>();
        if (failure) return failure;
        const task = history.tasks.find(
          (candidate) => candidate.locator.line === input.locator.line,
        )!;
        history = nextHistorySnapshot(
          history.tasks.filter((candidate) => candidate.locator.line !== input.locator.line),
          input.date,
        );
        today = nextTodaySnapshot([
          ...today.tasks,
          {
            locator: locator(today.tasks.length + 1, today.revision),
            content: task.content,
            ...(task.projectName != null ? { projectName: task.projectName } : {}),
            details: task.details,
            completed: false,
            ...(task.addedDate ? { addedDate: task.addedDate } : {}),
          },
        ]);
        return { ok: true as const, data: historyView(input.date) };
      },
      async edit(input: {
        date: string;
        locator: { line: number; revision: string };
        content: string;
        details: string;
        projectName?: string | null | undefined;
        completedAt?: string;
      }) {
        const failure = failureForScenario<HistoryViewSnapshot>();
        if (failure) return failure;
        history = nextHistorySnapshot(
          history.tasks.map((task) =>
            task.locator.line === input.locator.line
              ? input.completedAt
                ? {
                    ...task,
                    content: input.content,
                    ...(input.projectName !== undefined ? { projectName: input.projectName } : {}),
                    details: input.details,
                    completedAt: input.completedAt,
                  }
                : (() => {
                    const withoutTime = { ...task };
                    delete withoutTime.completedAt;
                    return {
                      ...withoutTime,
                      content: input.content,
                      ...(input.projectName !== undefined
                        ? { projectName: input.projectName }
                        : {}),
                      details: input.details,
                    };
                  })()
              : task,
          ),
        );
        return { ok: true as const, data: historyView(input.date) };
      },
      async delete(input: { date: string; locator: { line: number; revision: string } }) {
        const failure = failureForScenario<HistoryViewSnapshot>();
        if (failure) return failure;
        history = nextHistorySnapshot(
          history.tasks.filter((task) => task.locator.line !== input.locator.line),
        );
        return { ok: true as const, data: historyView(input.date) };
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
      async preview() {
        return {
          ok: true as const,
          data: {
            token: crypto.randomUUID(),
            text: '本地项目工作记录预览',
            taskCount: 2,
            pendingCount: 0,
          },
        };
      },
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
      async setNoteCollapsed(collapsed: boolean) {
        noteCollapsed = collapsed;
        return noteCollapsed;
      },
      async getNoteDockState() {
        return clone(noteDockState);
      },
      async setNoteInteractionState(input: NoteInteractionState) {
        noteInteractionState = clone(input);
      },
      async openProjectCreate() {
        projectCreateOpen = true;
      },
      async closeProjectCreate() {
        projectCreateOpen = false;
      },
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
          ...(input.alwaysOnTop === false
            ? { showOnFullScreen: false }
            : input.showOnFullScreen !== undefined
              ? { showOnFullScreen: input.showOnFullScreen }
              : {}),
          ...(input.edgeAutoHideEnabled !== undefined
            ? { edgeAutoHideEnabled: input.edgeAutoHideEnabled }
            : {}),
          ...(input.edgeRevealColor !== undefined
            ? { edgeRevealColor: input.edgeRevealColor }
            : {}),
          ...(input.completedExpanded !== undefined
            ? { completedExpanded: input.completedExpanded }
            : {}),
          ...(input.addedDateDisplay !== undefined
            ? { addedDateDisplay: input.addedDateDisplay }
            : {}),
        };
        settingsListeners.forEach((listener) => listener(clone(settings)));
        return { ok: true as const, data: clone(settings) };
      },
      async resetAppearance() {
        if (scenario === 'io-error') return failureForScenario<SettingsSnapshot>()!;
        settings = {
          ...settings,
          noteColor: DEFAULT_NOTE_COLOR,
          noteOpacity: 1,
          edgeRevealColor: DEFAULT_EDGE_REVEAL_COLOR,
        };
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
      onProjectCreated(listener: (name: string) => void) {
        projectCreatedListeners.add(listener);
        return () => {
          projectCreatedListeners.delete(listener);
        };
      },
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
      onNoteDockStateChanged(listener: (snapshot: NoteDockSnapshot) => void) {
        noteDockListeners.add(listener);
        return () => noteDockListeners.delete(listener);
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
    emitNoteDockState(snapshot) {
      noteDockState = clone(snapshot);
      noteDockListeners.forEach((listener) => listener(clone(noteDockState)));
    },
    getLastNoteInteractionState() {
      return clone(noteInteractionState);
    },
  };
}
