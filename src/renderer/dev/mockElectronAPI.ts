import type { ElectronAPI } from '../../preload/apiTypes';
import type {
  DataChangedEvent,
  DayRecordSnapshot,
  TodaySnapshot,
  WeeklySnapshot,
} from '../../shared/domain';
import type { ApiResult, ExportReportResult } from '../../shared/results';

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
}

export function createMockElectronAPI(
  scenario: MockScenario = 'default',
): MockElectronAPIController {
  let today = clone(mockTodaySnapshot);
  let history = clone(mockHistoricalSnapshot);
  let revisionSequence = 1;
  const listeners = new Set<(event: DataChangedEvent) => void>();

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
    },
    window: {
      async openWeekly() {},
      async showNote() {},
    },
    app: {
      async openDataFolder() {},
      async setAlwaysOnTop() {
        return { ok: true as const, data: undefined };
      },
      async quit() {},
    },
    events: {
      onDataChanged(listener: (event: DataChangedEvent) => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
  } satisfies ElectronAPI;

  return {
    api,
    emit(event) {
      listeners.forEach((listener) => listener(event));
    },
  };
}
