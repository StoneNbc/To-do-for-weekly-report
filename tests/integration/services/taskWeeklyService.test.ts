import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { TodayRepository } from '../../../src/main/repositories/todayRepository';
import { WeekRepository } from '../../../src/main/repositories/weekRepository';
import { ArchiveService, type Clock } from '../../../src/main/services/archiveService';
import { TaskService } from '../../../src/main/services/taskService';
import { FutureHistoricalDateError, WeeklyService } from '../../../src/main/services/weeklyService';

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
    weekly: new WeeklyService(weeks, today, clock),
    today,
    weeks,
  };
};

describe('TaskService', () => {
  it('supports CRUD and injects the completion time from the main-process clock', async () => {
    const { task } = await setup();
    let snapshot = await task.addTodayTask(' 新任务 ');
    expect(snapshot.tasks[0]?.content).toBe('新任务');
    snapshot = await task.toggleTodayTask(snapshot.tasks[0]!.locator);
    expect(snapshot.tasks[0]).toMatchObject({ completed: true, completedAt: '14:20' });
    snapshot = await task.editTodayTask(snapshot.tasks[0]!.locator, '已编辑');
    expect(snapshot.tasks[0]).toMatchObject({ content: '已编辑', completedAt: '14:20' });
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
    const { weekly } = await setup();
    let day = await weekly.addHistoricalTask({
      date: '2026-08-11',
      content: '补录昨天',
      completedAt: '18:00',
    });
    expect(day.tasks[0]).toMatchObject({ date: '2026-08-11', content: '补录昨天' });
    day = await weekly.editHistoricalTask({
      date: '2026-08-11',
      locator: day.tasks[0]!.locator,
      content: '修改补录',
    });
    expect(day.tasks[0]?.content).toBe('修改补录');
    day = await weekly.deleteHistoricalTask({ date: '2026-08-11', locator: day.tasks[0]!.locator });
    expect(day.tasks).toEqual([]);
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
