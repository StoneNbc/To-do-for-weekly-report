import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import { TodayRepository } from '../../../src/main/repositories/todayRepository';
import { WeekRepository } from '../../../src/main/repositories/weekRepository';
import { ArchiveService, type Clock } from '../../../src/main/services/archiveService';
import { TaskService } from '../../../src/main/services/taskService';
import {
  CompletionBeforeAddedDateError,
  FutureHistoricalDateError,
  HistoryTransferPartialFailureError,
  WeeklyService,
} from '../../../src/main/services/weeklyService';

const setup = async (todayText = '# 2026-08-13\n') => {
  const directory = await mkdtemp(join(tmpdir(), 'sticky-services-'));
  const path = join(directory, 'today.txt');
  await writeFile(path, todayText, 'utf8');
  const clock: Clock = { now: () => new Date('2026-08-13T14:20:00') };
  const today = new TodayRepository(path, undefined, () => '2026-08-13');
  const weeks = new WeekRepository(join(directory, 'weeks'));
  const archive = new ArchiveService(today, weeks, clock);
  return {
    task: new TaskService(today, archive, clock),
    weekly: new WeeklyService(weeks, today, clock, archive),
    today,
    weeks,
  };
};

describe('TaskService', () => {
  it('supports CRUD and injects the completion time from the main-process clock', async () => {
    const { task } = await setup();
    let snapshot = await task.addTodayTask(' 新任务 ');
    expect(snapshot.tasks[0]).toMatchObject({ content: '新任务', addedDate: '2026-08-13' });
    snapshot = await task.toggleTodayTask(snapshot.tasks[0]!.locator);
    expect(snapshot.tasks[0]).toMatchObject({ completed: true, completedAt: '14:20' });
    snapshot = await task.editTodayTask(snapshot.tasks[0]!.locator, '已编辑', '补充说明');
    expect(snapshot.tasks[0]).toMatchObject({
      content: '已编辑',
      details: '补充说明',
      completedAt: '14:20',
    });
    snapshot = await task.toggleTodayTask(snapshot.tasks[0]!.locator);
    expect(snapshot.tasks[0]).toMatchObject({ completed: false });
    expect(snapshot.tasks[0]).not.toHaveProperty('completedAt');
    snapshot = await task.deleteTodayTask(snapshot.tasks[0]!.locator);
    expect(snapshot.tasks).toEqual([]);
  });

  it('reconciles an old today file before mutation', async () => {
    const { task, weeks } = await setup('# 2026-08-12\n- [x] 昨日完成\n- [ ] 顺延\n');
    const snapshot = await task.addTodayTask('今天新增');
    expect(snapshot.fileDate).toBe('2026-08-13');
    expect(snapshot.tasks.map((item) => item.content)).toEqual(['顺延', '今天新增']);
    expect((await weeks.getDay('2026-08-12')).tasks[0]?.content).toBe('昨日完成');
  });
});

describe('WeeklyService', () => {
  it('uses the selected historical date for add/edit/delete', async () => {
    const { weekly, weeks } = await setup();
    const day = await weeks.addHistoricalTask('2026-08-11', {
      content: '历史记录',
      addedDate: '2026-08-10',
      completedAt: '18:00',
    });
    let view = await weekly.editHistoricalTask({
      date: '2026-08-11',
      locator: day.tasks[0]!.locator,
      content: '修改记录',
      completedAt: '18:00',
    });
    expect(view.completed.tasks[0]).toMatchObject({
      content: '修改记录',
      addedDate: '2026-08-10',
      completedAt: '18:00',
    });
    view = await weekly.deleteHistoricalTask({
      date: '2026-08-11',
      locator: view.completed.tasks[0]!.locator,
    });
    expect(view.completed.tasks).toEqual([]);
  });

  it('shows eligible global pending tasks and moves them to and from a historical date', async () => {
    const { weekly, today } = await setup(
      '# 2026-08-13\n- [ ] 可回填 @添加:2026-08-10\n  | 回填说明\n- [ ] 旧任务\n- [ ] 尚未添加 @添加:2026-08-13\n',
    );
    let view = await weekly.getHistoryView('2026-08-12');
    expect(view.backlog.tasks.map((task) => task.content)).toEqual(['可回填', '旧任务']);

    view = await weekly.completePendingOnDate({
      date: '2026-08-12',
      locator: view.backlog.tasks[0]!.locator,
    });
    expect(view.completed.tasks[0]).toMatchObject({
      content: '可回填',
      details: '回填说明',
      addedDate: '2026-08-10',
    });
    expect(view.completed.tasks[0]).not.toHaveProperty('completedAt');
    expect((await today.read()).snapshot.tasks.map((task) => task.content)).not.toContain('可回填');

    view = await weekly.reopenHistoricalTask({
      date: '2026-08-12',
      locator: view.completed.tasks[0]!.locator,
    });
    expect(view.backlog.tasks.find((task) => task.content === '可回填')).toMatchObject({
      content: '可回填',
      details: '回填说明',
      addedDate: '2026-08-10',
      completed: false,
    });
  });

  it('records the selected history date and immediately shows the new global task', async () => {
    const { weekly, today } = await setup();
    const view = await weekly.addPendingFromHistory({ date: '2026-08-12', content: '今天录入' });
    expect(view.backlog.tasks).toHaveLength(1);
    expect(view.backlog.tasks[0]).toMatchObject({
      content: '今天录入',
      addedDate: '2026-08-12',
    });
    expect((await today.read()).snapshot.tasks[0]).toMatchObject({
      content: '今天录入',
      addedDate: '2026-08-12',
    });
  });

  it('rejects completion before a known added date but allows legacy tasks', async () => {
    const { weekly } = await setup('# 2026-08-13\n- [ ] 有日期 @添加:2026-08-12\n- [ ] 旧任务\n');
    const todayView = await weekly.getHistoryView('2026-08-11');
    expect(todayView.backlog.tasks.map((task) => task.content)).toEqual(['旧任务']);
    const current = await weekly.getHistoryView('2026-08-12');
    await expect(
      weekly.completePendingOnDate({
        date: '2026-08-11',
        locator: current.backlog.tasks[0]!.locator,
      }),
    ).rejects.toBeInstanceOf(CompletionBeforeAddedDateError);
    const completed = await weekly.completePendingOnDate({
      date: '2026-08-11',
      locator: todayView.backlog.tasks[0]!.locator,
    });
    expect(completed.completed.tasks[0]?.content).toBe('旧任务');
  });

  it('rolls back the week insertion when removing the pending task fails', async () => {
    const { weekly, today, weeks } = await setup('# 2026-08-13\n- [ ] 回滚任务 @添加:2026-08-10\n');
    const view = await weekly.getHistoryView('2026-08-12');
    vi.spyOn(today, 'deleteTask').mockRejectedValueOnce(new Error('today write failed'));

    await expect(
      weekly.completePendingOnDate({
        date: '2026-08-12',
        locator: view.backlog.tasks[0]!.locator,
      }),
    ).rejects.toThrow('today write failed');
    expect((await weeks.getDay('2026-08-12')).tasks).toEqual([]);
    expect((await today.read()).snapshot.tasks[0]?.content).toBe('回滚任务');
  });

  it('reports partial failure when a cross-file rollback also fails', async () => {
    const { weekly, today, weeks } = await setup('# 2026-08-13\n- [ ] 重复风险 @添加:2026-08-10\n');
    const view = await weekly.getHistoryView('2026-08-12');
    vi.spyOn(today, 'deleteTask').mockRejectedValueOnce(new Error('today write failed'));
    vi.spyOn(weeks, 'deleteHistoricalTask').mockRejectedValueOnce(new Error('rollback failed'));

    await expect(
      weekly.completePendingOnDate({
        date: '2026-08-12',
        locator: view.backlog.tasks[0]!.locator,
      }),
    ).rejects.toBeInstanceOf(HistoryTransferPartialFailureError);
    expect((await weeks.getDay('2026-08-12')).tasks[0]?.content).toBe('重复风险');
    expect((await today.read()).snapshot.tasks[0]?.content).toBe('重复风险');
  });

  it('rolls back the restored pending task when removing history fails', async () => {
    const { weekly, today, weeks } = await setup();
    const day = await weeks.addHistoricalTask('2026-08-12', {
      content: '恢复回滚',
      addedDate: '2026-08-10',
    });
    vi.spyOn(weeks, 'deleteHistoricalTask').mockRejectedValueOnce(new Error('week write failed'));

    await expect(
      weekly.reopenHistoricalTask({
        date: '2026-08-12',
        locator: day.tasks[0]!.locator,
      }),
    ).rejects.toThrow('week write failed');
    expect((await today.read()).snapshot.tasks).toEqual([]);
    expect((await weeks.getDay('2026-08-12')).tasks[0]?.content).toBe('恢复回滚');
  });

  it('rejects today and future dates in history mode', async () => {
    const { weekly } = await setup();
    await expect(weekly.getDay('2026-08-13')).rejects.toBeInstanceOf(FutureHistoricalDateError);
  });

  it('merges current-week archived tasks before today tasks without deduplication', async () => {
    const { weekly, weeks, today } = await setup(
      '# 2026-08-13\n- [x] 相同 @09:00\n- [x] 相同 @09:00\n- [ ] 不展示\n',
    );
    await weeks.addHistoricalTask('2026-08-13', { content: '相同', completedAt: '09:00' });
    const week = await weekly.getWeek(2026, 33);
    const thursday = week.groups.find((group) => group.date === '2026-08-13');
    expect(thursday?.tasks.map((task) => task.content)).toEqual(['相同', '相同', '相同']);
    expect(week.total).toBe(3);
    expect((await today.read()).snapshot.tasks).toHaveLength(3);
  });

  it('does not merge today into a historical week', async () => {
    const { weekly } = await setup('# 2026-08-13\n- [x] 今天完成 @09:00\n');
    expect((await weekly.getWeek(2026, 32)).total).toBe(0);
  });
});
