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
    await writeFile(path, '# 2026-08-13\r\n- [ ] 相同\r\n自定义行\r\n- [ ] 相同\r\n', 'utf8');
    const repository = new TodayRepository(path, new TextFileStore(), () => '2026-08-13');
    const before = await repository.read();
    const first = before.snapshot.tasks[0];
    expect(first).toBeDefined();
    await repository.updateTask(first!.locator, { content: '只改第一条' });

    expect(await readFile(path, 'utf8')).toBe(
      '# 2026-08-13\r\n- [ ] 只改第一条\r\n自定义行\r\n- [ ] 相同\r\n',
    );
  });

  it('persists added dates while editing and moving through repository snapshots', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sticky-added-date-'));
    const path = join(directory, 'today.txt');
    await writeFile(path, '# 2026-08-13\n', 'utf8');
    const repository = new TodayRepository(path, new TextFileStore(), () => '2026-08-13');
    let result = await repository.addTask('记录日期', null, '2026-08-10');
    expect(result.snapshot.tasks[0]?.addedDate).toBe('2026-08-10');
    result = {
      ...(await repository.updateTask(result.snapshot.tasks[0]!.locator, { content: '编辑后' })),
      insertedLocator: result.insertedLocator,
    };
    expect(result.snapshot.tasks[0]).toMatchObject({ content: '编辑后', addedDate: '2026-08-10' });
    expect(await readFile(path, 'utf8')).toContain('编辑后 @添加:2026-08-10');
  });

  it('edits, appends, and deletes today tasks as complete title-and-details blocks', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sticky-today-details-'));
    const path = join(directory, 'today.txt');
    await writeFile(
      path,
      '# 2026-08-13\n- [ ] 第一条\n  | 原说明\n自定义行\n- [ ] 第二条\n  | 第二条说明\n',
      'utf8',
    );
    const repository = new TodayRepository(path, new TextFileStore(), () => '2026-08-13');
    let snapshot = (await repository.read()).snapshot;

    snapshot = (
      await repository.updateTask(snapshot.tasks[0]!.locator, {
        content: '第一条已编辑',
        details: '第一行\n\n- [ ] 只是详情',
      })
    ).snapshot;
    expect(snapshot.tasks[0]).toMatchObject({
      content: '第一条已编辑',
      details: '第一行\n\n- [ ] 只是详情',
    });

    snapshot = (await repository.addTask('第三条', snapshot.revision, undefined, '第三条说明'))
      .snapshot;
    expect(await readFile(path, 'utf8')).toContain(
      '- [ ] 第二条\n  | 第二条说明\n- [ ] 第三条\n  | 第三条说明\n',
    );

    snapshot = (await repository.deleteTask(snapshot.tasks[0]!.locator)).snapshot;
    expect(snapshot.tasks.map((task) => task.content)).toEqual(['第二条', '第三条']);
    expect(await readFile(path, 'utf8')).toContain('自定义行\n- [ ] 第二条');
    expect(await readFile(path, 'utf8')).not.toContain('第一行');
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

  it('persists and removes historical task details with their owning task', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sticky-week-details-'));
    const weeks = join(directory, 'weeks');
    const path = join(weeks, 'week-2026-W33.txt');
    const repository = new WeekRepository(weeks);
    let day = await repository.addHistoricalTask('2026-08-10', {
      content: '历史任务',
      details: '原说明\n第二行',
      completedAt: '09:00',
    });
    expect(day.tasks[0]?.details).toBe('原说明\n第二行');

    day = await repository.updateHistoricalTask('2026-08-10', day.tasks[0]!.locator, {
      content: '历史任务已编辑',
      details: '新说明\n\n1. 普通文本',
      completedAt: '09:00',
    });
    expect(await readFile(path, 'utf8')).toContain(
      '- 历史任务已编辑 @09:00\n  | 新说明\n  |\n  | 1. 普通文本\n',
    );

    day = await repository.deleteHistoricalTask('2026-08-10', day.tasks[0]!.locator);
    expect(day.tasks).toEqual([]);
    expect(await readFile(path, 'utf8')).not.toContain('新说明');
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
