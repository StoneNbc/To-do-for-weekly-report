import { describe, expect, it, vi } from 'vitest';
import type { IpcMain } from 'electron';
import type {
  HistoryViewSnapshot,
  TodaySnapshot,
  WeeklySnapshot,
} from '../../../src/shared/domain';
import { IPC } from '../../../src/main/ipc/channels';
import { registerBusinessHandlers } from '../../../src/main/ipc/registerHandlers';
import type { AppLogger } from '../../../src/main/logging/logger';

type Handler = (_event: unknown, ...args: unknown[]) => Promise<unknown>;

const makeLogger = (): AppLogger => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  flush: vi.fn(async () => undefined),
});

const snapshot: TodaySnapshot = {
  fileDate: '2026-08-13',
  currentDate: '2026-08-13',
  revision: 'revision-next',
  tasks: [],
  warnings: [],
};

const weeklySnapshot: WeeklySnapshot = {
  isoYear: 2026,
  isoWeek: 33,
  weekStart: '2026-08-10',
  weekEnd: '2026-08-16',
  revision: null,
  groups: [],
  total: 0,
};

const historyView: HistoryViewSnapshot = {
  date: '2026-08-12',
  backlog: snapshot,
  completed: { date: '2026-08-12', revision: 'week-r', tasks: [], warnings: [] },
};

const setup = () => {
  const handlers = new Map<string, Handler>();
  const ipcMain = {
    handle: vi.fn((channel: string, handler: Handler) => handlers.set(channel, handler)),
    removeHandler: vi.fn((channel: string) => handlers.delete(channel)),
  };
  const task = {
    getToday: vi.fn(async () => snapshot),
    addTodayTask: vi.fn(async () => snapshot),
    toggleTodayTask: vi.fn(async () => snapshot),
    editTodayTask: vi.fn(async () => snapshot),
    deleteTodayTask: vi.fn(async () => snapshot),
  };
  const weekly = {
    getHistoryView: vi.fn(async () => historyView),
    addPendingFromHistory: vi.fn(async () => historyView),
    editPendingFromHistory: vi.fn(async () => historyView),
    deletePendingFromHistory: vi.fn(async () => historyView),
    completePendingOnDate: vi.fn(async () => historyView),
    reopenHistoricalTask: vi.fn(async () => historyView),
    editHistoricalTask: vi.fn(async () => historyView),
    deleteHistoricalTask: vi.fn(async () => historyView),
    getWeek: vi.fn(async () => weeklySnapshot),
  };
  registerBusinessHandlers({
    ipcMain: ipcMain as unknown as Pick<IpcMain, 'handle' | 'removeHandler'>,
    services: { task, weekly },
    logger: makeLogger(),
  });
  return { handlers, task, weekly };
};

describe('business IPC registration', () => {
  it('validates task content before invoking a service', async () => {
    const { handlers, task } = setup();

    const result = await handlers.get(IPC.todayAdd)?.({}, '   ');

    expect(result).toEqual({
      ok: false,
      error: { code: 'INVALID_INPUT', message: '输入内容无效，请检查后重试' },
    });
    expect(task.addTodayTask).not.toHaveBeenCalled();
  });

  it('validates and forwards multiline details when editing today', async () => {
    const { handlers, task } = setup();
    const locator = { line: 1, revision: 'revision-current' };

    const valid = await handlers.get(IPC.todayEdit)?.(
      {},
      {
        locator,
        content: '编辑后的标题',
        details: '第一行\n\n- [ ] 普通说明',
        completedAt: '09:30',
      },
    );
    const invalid = await handlers.get(IPC.todayEdit)?.(
      {},
      {
        locator,
        content: '标题',
        details: '包含\0非法字符',
      },
    );

    expect(valid).toEqual({ ok: true, data: snapshot });
    expect(task.editTodayTask).toHaveBeenCalledWith(
      locator,
      '编辑后的标题',
      '第一行\n\n- [ ] 普通说明',
      '09:30',
    );
    expect(invalid).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    expect(task.editTodayTask).toHaveBeenCalledTimes(1);
  });

  it('passes only a validated ISO week to the weekly service', async () => {
    const { handlers, weekly } = setup();

    const invalid = await handlers.get(IPC.weekGet)?.(
      {},
      { isoYear: 2026, isoWeek: 54, path: '/tmp/escape' },
    );
    const valid = await handlers.get(IPC.weekGet)?.(
      {},
      { isoYear: 2026, isoWeek: 33, path: '/tmp/ignored' },
    );

    expect(invalid).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    expect(valid).toEqual({ ok: true, data: weeklySnapshot });
    expect(weekly.getWeek).toHaveBeenCalledWith(2026, 33);
    expect(weekly.getWeek).not.toHaveBeenCalledWith(expect.stringContaining('/tmp'));
  });

  it('maps known service errors without returning a stack', async () => {
    const { handlers, task } = setup();
    const error = Object.assign(new Error('数据文件已更新，请刷新后重试'), {
      code: 'FILE_CHANGED',
    });
    task.toggleTodayTask.mockRejectedValueOnce(error);

    const result = await handlers.get(IPC.todayToggle)?.({}, { line: 1, revision: 'old-revision' });

    expect(result).toEqual({
      ok: false,
      error: { code: 'FILE_CHANGED', message: '数据文件已更新，请刷新后重试' },
    });
    expect(JSON.stringify(result)).not.toContain('stack');
  });

  it('never accepts an output or data path in business handlers', () => {
    const { handlers } = setup();
    expect([...handlers.keys()]).toEqual(
      expect.arrayContaining([IPC.todayGet, IPC.todayAdd, IPC.historyGetView, IPC.weekGet]),
    );
    expect([...handlers.keys()]).not.toContain('file:write-path');
  });
});
