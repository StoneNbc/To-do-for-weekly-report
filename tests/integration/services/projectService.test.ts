import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { TextFileStore, computeRevision } from '../../../src/main/repositories/textFileStore';
import { TodayRepository } from '../../../src/main/repositories/todayRepository';
import { WeekRepository } from '../../../src/main/repositories/weekRepository';
import { ProjectService } from '../../../src/main/services/projectService';
import { ProjectRenameService } from '../../../src/main/services/projectRenameService';
import { BusinessCoordinator } from '../../../src/main/services/businessCoordinator';
import { ArchiveService } from '../../../src/main/services/archiveService';
import { WeeklyService } from '../../../src/main/services/weeklyService';
import { parseToday } from '../../../src/main/parsers/todayParser';
import {
  parseProjectContent,
  encodeProjectName,
  encodeProjectTitle,
} from '../../../src/main/parsers/projectField';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
const setup = async (text = '# 2026-09-09\n') => {
  const root = await mkdtemp(join(tmpdir(), 'sticky-project-'));
  roots.push(root);
  await mkdir(join(root, 'weeks'));
  await writeFile(join(root, 'today.txt'), text);
  const coordinator = new BusinessCoordinator();
  const store = new TextFileStore(() => coordinator.assertWritable());
  const today = new TodayRepository(join(root, 'today.txt'), store, () => '2026-09-09');
  const weeks = new WeekRepository(join(root, 'weeks'), store);
  const projects = new ProjectService(root, store, coordinator);
  return { root, coordinator, store, today, weeks, projects };
};
const create = async (projects: ProjectService, name: string) =>
  projects.create({ name, expectedRevision: (await projects.get()).revision });

describe('project text and lifecycle', () => {
  it('round-trips names and literal project suffixes without assigning legacy prose', async () => {
    for (const name of ['云网吧', '客户 A', '客户"甲"', '研发\\测试', 'A @项目:B']) {
      expect(
        parseProjectContent(
          `${encodeProjectTitle('讲解 @项目:示例\\文档')} @项目:${encodeProjectName(name)}`,
        ),
      ).toMatchObject({ content: '讲解 @项目:示例\\文档', projectName: name });
    }
    expect(() => parseProjectContent('任务 @项目:A @项目:B')).toThrow();
    const initial =
      '# 2026-09-09\r\n- [ ] 解释 @项目:旧文字\\原文 @添加:2026-09-09\r\n  | 详情 @项目:原样\r\n用户注释\r\n';
    const { today, root } = await setup(initial);
    await today.addTask('项目待办', null, '2026-09-09', '两行\n详情', '客户 A');
    const read = await today.read();
    expect(read.snapshot.tasks[0]).toMatchObject({
      content: '解释 @项目:旧文字\\原文',
      details: '详情 @项目:原样',
    });
    expect(read.snapshot.tasks[0]?.projectName).toBeUndefined();
    expect(read.snapshot.tasks[1]).toMatchObject({ content: '项目待办', projectName: '客户 A' });
    expect(read.file.text).toContain('用户注释\r\n');
    const backups = await readdir(join(root, 'recovery/project-format'));
    expect(
      await readFile(join(root, 'recovery/project-format', backups[0]!, 'today.txt'), 'utf8'),
    ).toBe(initial);
  });

  it('moves identical tasks by original lines and rejects stale batches', async () => {
    const { today } = await setup('# 2026-09-09\n- [ ] 相同\n  | 第一条详情\n- [ ] 相同\n');
    const before = await today.read();
    const moved = await today.moveMany({
      locators: [before.snapshot.tasks[1]!.locator],
      projectName: 'A',
    });
    expect(moved.tasks.map((task) => task.projectName ?? null)).toEqual([null, 'A']);
    expect(moved.tasks[0]?.details).toBe('第一条详情');
    await expect(
      today.moveMany({ locators: [before.snapshot.tasks[0]!.locator], projectName: 'B' }),
    ).rejects.toMatchObject({ code: 'FILE_CHANGED' });
    const edited = await today.updateTask(moved.tasks[0]!.locator, {
      projectName: '空格 项目',
      details: '保留详情',
    });
    expect(edited.snapshot.tasks[0]).toMatchObject({
      projectName: '空格 项目',
      details: '保留详情',
    });
  });

  it('keeps projects and details through historical completion, reopen and daily archive', async () => {
    const { today, weeks } = await setup('# 2026-09-09\n');
    const clock = { now: () => new Date(2026, 8, 9, 16, 0) };
    const archive = new ArchiveService(today, weeks, clock);
    const weekly = new WeeklyService(weeks, today, clock, archive);
    const added = await today.addTask('任务', null, '2026-09-07', '详情', '项目');
    const done = await weekly.completePendingOnDate({
      date: '2026-09-08',
      locator: added.insertedLocator,
    });
    expect(done.completed.tasks[0]).toMatchObject({ projectName: '项目', details: '详情' });
    const reopened = await weekly.reopenHistoricalTask({
      date: '2026-09-08',
      locator: done.completed.tasks[0]!.locator,
    });
    expect(reopened.backlog.tasks[0]).toMatchObject({ projectName: '项目', details: '详情' });
    await today.updateTask(reopened.backlog.tasks[0]!.locator, {
      completed: true,
      completedAt: '16:00',
    });
    expect((await weekly.getWeek(2026, 37)).groups[0]?.tasks[0]?.projectName).toBe('项目');
    await new ArchiveService(today, weeks, { now: () => new Date(2026, 8, 10) }).reconcileToToday(
      'midnight',
    );
    expect((await weeks.getDay('2026-09-09')).tasks[0]).toMatchObject({
      projectName: '项目',
      details: '详情',
    });
  });

  it('renames all exact project fields, preserves prose and prevents implicit merging', async () => {
    const { projects, today, weeks, root } = await setup();
    await create(projects, '客户 A');
    await today.addTask('客户 A 原文', null, undefined, '客户 A 详情', '客户 A');
    await weeks.addHistoricalTask('2026-09-01', {
      content: '客户 A 历史',
      projectName: '客户 A',
      details: '说明',
    });
    const plan = await projects.previewRename({
      oldName: '客户 A',
      newName: '新名字',
      expectedRevision: (await projects.get()).revision,
    });
    expect(plan).toMatchObject({ fileCount: 3, taskCount: 2 });
    const result = await projects.rename(plan.token);
    expect(result.projects[0]?.name).toBe('新名字');
    expect((await today.read()).snapshot.tasks[0]).toMatchObject({
      content: '客户 A 原文',
      details: '客户 A 详情',
      projectName: '新名字',
    });
    expect((await weeks.getDay('2026-09-01')).tasks[0]?.projectName).toBe('新名字');
    await expect(
      projects.update({ name: '新名字', status: 'archived', expectedRevision: result.revision }),
    ).rejects.toMatchObject({ code: 'PROJECT_HAS_PENDING' });
    await expect(
      projects.deleteEmpty({ name: '新名字', expectedRevision: result.revision }),
    ).rejects.toMatchObject({ code: 'PROJECT_IN_USE' });
    await today.addTask('占用', null, undefined, '', '未登记');
    await expect(
      projects.previewRename({
        oldName: '新名字',
        newName: '未登记',
        expectedRevision: result.revision,
      }),
    ).rejects.toMatchObject({ code: 'PROJECT_NAME_EXISTS' });
    expect((await readdir(join(root, 'recovery/project-rename'))).length).toBe(1);
  });

  it('does not write invalid or unknown formats', async () => {
    const { today } = await setup('# 2026-09-09\n!format:projects-v9\n- [ ] 任务\n');
    const before = await today.read();
    await expect(today.deleteTask(before.snapshot.tasks[0]!.locator)).rejects.toMatchObject({
      code: 'PROJECT_FORMAT_INVALID',
    });
    expect((await today.read()).file.text).toBe(before.file.text);
    expect(
      parseToday('# 2026-09-09\n!format:projects-v1\n- [ ] 任务 @项目:"未闭合\n').warnings.some(
        (w) => w.code === 'INVALID_PROJECT',
      ),
    ).toBe(true);
  });
});

describe('rename failure recovery', () => {
  it.each([0, 1])(
    'rolls back failure after file %s and is safe to retry after restart',
    async (index) => {
      const { store, root, coordinator } = await setup();
      const a = join(root, 'today.txt'),
        b = join(root, 'projects.txt');
      await store.writeAtomic(b, '# projects:v1\n');
      const originals = await Promise.all([store.read(a), store.read(b)]);
      const sources = async () =>
        Promise.all(
          [a, b].map(async (path) => ({ path, revision: (await store.read(path)).revision })),
        );
      const renames = new ProjectRenameService(root, store, coordinator, sources, async (step) => {
        if (step === index) throw new Error('故障注入');
      });
      const plan = renames.preview(
        'A',
        'B',
        originals.map((file) => ({ ...file, next: file.text + 'changed\n' })),
        await sources(),
        0,
      );
      await expect(renames.execute(plan.token)).rejects.toThrow('故障注入');
      expect(await readFile(a, 'utf8')).toBe(originals[0]?.text);
      expect(await readFile(b, 'utf8')).toBe(originals[1]?.text);
      expect(
        (await new ProjectRenameService(root, store, coordinator, sources).recover()).blocked,
      ).toBe(false);
    },
  );

  it('preserves external edits, blocks further writes and recovers once the conflict is resolved', async () => {
    const { store, root, coordinator } = await setup();
    const path = join(root, 'today.txt'),
      before = await store.read(path);
    const sources = async () => [{ path, revision: (await store.read(path)).revision }];
    const renames = new ProjectRenameService(root, store, coordinator, sources, async () => {
      await writeFile(path, '外部修改');
      throw new Error('中断');
    });
    const next = before.text + '更新';
    const plan = renames.preview('A', 'B', [{ ...before, next }], await sources(), 0);
    await expect(renames.execute(plan.token)).rejects.toMatchObject({
      code: 'PROJECT_RECOVERY_REQUIRED',
    });
    expect(await readFile(path, 'utf8')).toBe('外部修改');
    await expect(store.writeAtomic(path, '不能覆盖')).rejects.toMatchObject({
      code: 'PROJECT_RECOVERY_REQUIRED',
    });
    await writeFile(path, next);
    expect((await renames.recover()).blocked).toBe(false);
    expect(await readFile(path, 'utf8')).toBe(before.text);
  });
  it('recovers a durable prepared manifest after process exit before commit', async () => {
    const { store, root, coordinator } = await setup();
    const target = join(root, 'today.txt');
    const before = await store.read(target);
    const after = before.text + '- [ ] 已写入的改名结果\n';
    const directory = join(root, 'recovery/project-rename/interrupted');
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, '0.txt'), before.text);
    await writeFile(
      join(directory, 'manifest.json'),
      JSON.stringify({
        version: 1,
        state: 'prepared',
        files: [
          {
            path: 'today.txt',
            before: before.revision,
            after: computeRevision(after),
            backup: '0.txt',
          },
        ],
      }),
    );
    await writeFile(target, after);
    const restarted = new ProjectRenameService(root, store, coordinator, async () => []);
    expect((await restarted.recover()).blocked).toBe(false);
    expect(await readFile(target, 'utf8')).toBe(before.text);
    expect(JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8')).state).toBe(
      'rolled-back',
    );
    expect((await restarted.recover()).blocked).toBe(false);
  });
});
