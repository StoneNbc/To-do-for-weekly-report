import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { FileChangedError, TextFileStore } from '../../../src/main/repositories/textFileStore';
import { TodayRepository } from '../../../src/main/repositories/todayRepository';
import { WeekRepository } from '../../../src/main/repositories/weekRepository';

describe('repositories', () => {
  it('updates only one of two identical today tasks and preserves unknown CRLF lines', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sticky-today-'));
    const path = join(directory, 'today.txt');
    await writeFile(
      path,
      '# 2026-08-13\r\n- [ ] 相同\r\n自定义行\r\n- [ ] 相同\r\n',
      'utf8',
    );
    const repository = new TodayRepository(path, new TextFileStore(), () => '2026-08-13');
    const before = await repository.read();
    const first = before.snapshot.tasks[0];
    expect(first).toBeDefined();
    await repository.updateTask(first!.locator, { content: '只改第一条' });

    expect(await readFile(path, 'utf8')).toBe(
      '# 2026-08-13\r\n- [ ] 只改第一条\r\n自定义行\r\n- [ ] 相同\r\n',
    );
  });

  it('rejects an old revision without guessing by task content', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sticky-conflict-'));
    const path = join(directory, 'today.txt');
    await writeFile(path, '# 2026-08-13\n- [ ] 工作\n', 'utf8');
    const repository = new TodayRepository(path, new TextFileStore(), () => '2026-08-13');
    const before = await repository.read();
    await writeFile(path, '# 2026-08-13\n- [ ] 外部修改\n', 'utf8');

    await expect(repository.deleteTask(before.snapshot.tasks[0]!.locator)).rejects.toBeInstanceOf(
      FileChangedError,
    );
    expect(await readFile(path, 'utf8')).toContain('外部修改');
  });

  it('preserves the original missing trailing newline while editing', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sticky-no-eol-'));
    const path = join(directory, 'today.txt');
    await writeFile(path, '# 2026-08-13\n- [ ] 工作', 'utf8');
    const repository = new TodayRepository(path, new TextFileStore(), () => '2026-08-13');
    const before = await repository.read();
    await repository.updateTask(before.snapshot.tasks[0]!.locator, { content: '新工作' });
    expect(await readFile(path, 'utf8')).toBe('# 2026-08-13\n- [ ] 新工作');
  });

  it('serializes concurrent updates to the same path', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sticky-queue-'));
    const path = join(directory, 'counter.txt');
    await writeFile(path, '0', 'utf8');
    const store = new TextFileStore();
    await Promise.all(
      Array.from({ length: 20 }, () =>
        store.update(path, null, (snapshot) => ({
          text: String(Number(snapshot.text) + 1),
          result: undefined,
        })),
      ),
    );
    expect(await readFile(path, 'utf8')).toBe('20');
  });

  it('edits and deletes one exact duplicate historical task by revision and line', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sticky-week-'));
    const weeks = join(directory, 'weeks');
    const repository = new WeekRepository(weeks);
    await repository.addHistoricalTask('2026-08-10', { content: '相同', completedAt: '09:00' });
    let day = await repository.addHistoricalTask('2026-08-10', {
      content: '相同',
      completedAt: '09:00',
    });
    expect(day.tasks).toHaveLength(2);
    day = await repository.updateHistoricalTask('2026-08-10', day.tasks[1]!.locator, {
      content: '只改第二条',
      completedAt: '09:00',
    });
    expect(day.tasks.map((task) => task.content)).toEqual(['相同', '只改第二条']);
    day = await repository.deleteHistoricalTask('2026-08-10', day.tasks[0]!.locator);
    expect(day.tasks.map((task) => task.content)).toEqual(['只改第二条']);
  });

  it('adds into an existing day before unknown trailing content without deleting it', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sticky-week-unknown-'));
    const weeks = join(directory, 'weeks');
    const path = join(weeks, 'week-2026-W33.txt');
    const repository = new WeekRepository(weeks);
    await repository.addHistoricalTask('2026-08-10', { content: '原任务' });
    const withUnknown = `${await readFile(path, 'utf8')}自定义尾部\n`;
    await writeFile(path, withUnknown, 'utf8');
    await repository.addHistoricalTask('2026-08-10', { content: '新任务' });
    expect(await readFile(path, 'utf8')).toContain('- 原任务\n- 新任务\n自定义尾部\n');
  });

  it('serializes concurrent creation of one week file without losing either task', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sticky-week-create-'));
    const repository = new WeekRepository(join(directory, 'weeks'));
    await Promise.all([
      repository.addHistoricalTask('2026-08-10', { content: '第一条' }),
      repository.addHistoricalTask('2026-08-10', { content: '第二条' }),
    ]);
    const day = await repository.getDay('2026-08-10');
    expect(day.tasks.map((task) => task.content)).toEqual(['第一条', '第二条']);
  });
});
