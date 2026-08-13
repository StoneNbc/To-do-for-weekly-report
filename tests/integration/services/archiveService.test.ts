import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import { TodayRepository } from '../../../src/main/repositories/todayRepository';
import { WeekRepository } from '../../../src/main/repositories/weekRepository';
import {
  ArchivePartialFailureError,
  ArchiveService,
  FutureTodayFileError,
  type Clock,
} from '../../../src/main/services/archiveService';

const fixedClock = (localDate: string, time = '09:30'): Clock => ({
  now: () => new Date(`${localDate}T${time}:00`),
});

const setup = async (todayText: string, localDate: string) => {
  const directory = await mkdtemp(join(tmpdir(), 'sticky-archive-'));
  const todayPath = join(directory, 'today.txt');
  await writeFile(todayPath, todayText, 'utf8');
  const clock = fixedClock(localDate);
  const today = new TodayRepository(todayPath, undefined, () => localDate);
  const weeks = new WeekRepository(join(directory, 'weeks'));
  return { directory, todayPath, today, weeks, service: new ArchiveService(today, weeks, clock) };
};

describe('ArchiveService', () => {
  it('archives Friday completions to the previous week and carries pending tasks to Monday', async () => {
    const context = await setup(
      '# 2026-08-07\n- [x] 已完成 @17:20\n- [ ] 继续处理\n未知说明\n',
      '2026-08-10',
    );
    const result = await context.service.reconcileToToday('startup');
    expect(result).toEqual({
      status: 'archived',
      sourceDate: '2026-08-07',
      targetDate: '2026-08-10',
      archivedCount: 1,
      carriedCount: 1,
    });
    expect(await readFile(context.todayPath, 'utf8')).toBe(
      '# 2026-08-10\n- [ ] 继续处理\n未知说明\n',
    );
    expect(await readFile(join(context.directory, 'weeks/week-2026-W32.txt'), 'utf8')).toContain(
      '## 周五 08-07\n- 已完成 @17:20',
    );
  });

  it('handles multi-day and cross-ISO-year rollover using the file date', async () => {
    const context = await setup(
      '# 2020-12-31\n- [x] 跨年完成\n- [ ] 跨年顺延\n',
      '2021-01-04',
    );
    await context.service.reconcileToToday('resume');
    expect(await readFile(join(context.directory, 'weeks/week-2020-W53.txt'), 'utf8')).toContain(
      '## 周四 12-31\n- 跨年完成',
    );
    expect(await readFile(context.todayPath, 'utf8')).toBe(
      '# 2021-01-04\n- [ ] 跨年顺延\n',
    );
  });

  it('archives two completely identical tasks without deduplication', async () => {
    const context = await setup(
      '# 2026-08-12\n- [x] 相同 @10:00\n- [x] 相同 @10:00\n',
      '2026-08-13',
    );
    await context.service.reconcileToToday('midnight');
    const week = await readFile(join(context.directory, 'weeks/week-2026-W33.txt'), 'utf8');
    expect(week.match(/- 相同 @10:00/g)).toHaveLength(2);
  });

  it('updates only the header when there are no completed tasks', async () => {
    const context = await setup('# 2026-08-12\n- [ ] 顺延\n', '2026-08-13');
    const result = await context.service.reconcileToToday('startup');
    expect(result.status).toBe('rolled-over');
    expect(await readFile(context.todayPath, 'utf8')).toBe('# 2026-08-13\n- [ ] 顺延\n');
  });

  it('leaves today unchanged when writing the week fails', async () => {
    const context = await setup('# 2026-08-12\n- [x] 完成\n', '2026-08-13');
    vi.spyOn(context.weeks, 'appendArchivedTasks').mockRejectedValueOnce(new Error('week failed'));
    await expect(context.service.reconcileToToday('startup')).rejects.toThrow('week failed');
    expect(await readFile(context.todayPath, 'utf8')).toBe('# 2026-08-12\n- [x] 完成\n');
  });

  it('reports duplicate risk when week succeeds but today write fails', async () => {
    const context = await setup('# 2026-08-12\n- [x] 完成\n', '2026-08-13');
    vi.spyOn(context.today, 'rollOver').mockRejectedValueOnce(new Error('today failed'));
    await expect(context.service.reconcileToToday('startup')).rejects.toBeInstanceOf(
      ArchivePartialFailureError,
    );
    expect(await readFile(join(context.directory, 'weeks/week-2026-W33.txt'), 'utf8')).toContain(
      '- 完成',
    );
    expect(await readFile(context.todayPath, 'utf8')).toContain('# 2026-08-12');
  });

  it('rejects a future file date without changing either file', async () => {
    const context = await setup('# 2026-08-14\n- [x] 完成\n', '2026-08-13');
    await expect(context.service.reconcileToToday('startup')).rejects.toBeInstanceOf(
      FutureTodayFileError,
    );
    expect(await readFile(context.todayPath, 'utf8')).toBe('# 2026-08-14\n- [x] 完成\n');
  });

  it('serializes simultaneous reconcile triggers so tasks archive only once', async () => {
    const context = await setup('# 2026-08-12\n- [x] 完成\n', '2026-08-13');
    const results = await Promise.all([
      context.service.reconcileToToday('startup'),
      context.service.reconcileToToday('resume'),
    ]);
    expect(results.map((result) => result.status)).toEqual(['archived', 'noop']);
    const week = await readFile(join(context.directory, 'weeks/week-2026-W33.txt'), 'utf8');
    expect(week.match(/- 完成/g)).toHaveLength(1);
  });
});
