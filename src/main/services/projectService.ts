import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { ProjectMutation, ProjectSnapshot, ProjectStatus } from '../../shared/projects';
import { normalizeProjectName } from '../../shared/projects';
import { ProjectRepository } from '../repositories/projectRepository';
import { FileChangedError, TextFileStore } from '../repositories/textFileStore';
import { parseToday } from '../parsers/todayParser';
import { parseWeek } from '../parsers/weekParser';
import {
  assertProjectWritable,
  ProjectFormatError,
  replaceProjectField,
} from '../parsers/projectField';
import { ProjectRenameService } from './projectRenameService';
import { BusinessCoordinator } from './businessCoordinator';
import type { ArchiveService } from './archiveService';

export class ProjectError extends Error {
  constructor(
    readonly code:
      'PROJECT_NAME_EXISTS' | 'PROJECT_NOT_FOUND' | 'PROJECT_HAS_PENDING' | 'PROJECT_IN_USE',
    message: string,
  ) {
    super(message);
  }
}

export class ProjectService {
  readonly repository: ProjectRepository;
  readonly renames: ProjectRenameService;
  constructor(
    private readonly root: string,
    private readonly store: TextFileStore,
    private readonly coordinator: BusinessCoordinator,
    private readonly archive?: Pick<ArchiveService, 'reconcileToToday'>,
  ) {
    this.repository = new ProjectRepository(join(root, 'projects.txt'), store);
    this.renames = new ProjectRenameService(root, store, coordinator, () => this.sourceRevisions());
  }

  private async scan(strict = true) {
    const names = (await readdir(join(this.root, 'weeks')))
      .filter((name) => /^week-\d{4}-W\d{2}\.txt$/.test(name))
      .sort();
    const paths = [
      ...names.map((name) => join(this.root, 'weeks', name)),
      join(this.root, 'today.txt'),
    ];
    const results = [];
    for (const path of paths) {
      let file;
      try {
        file = await this.store.read(path);
      } catch (error) {
        if (
          path === join(this.root, 'today.txt') &&
          error instanceof Error &&
          'code' in error &&
          error.code === 'ENOENT'
        )
          continue;
        throw error;
      }
      const week = /week-(\d{4})-W(\d{2})\.txt$/.exec(path);
      const document = week
        ? parseWeek(file.text, { file: path, isoYear: Number(week[1]), isoWeek: Number(week[2]) })
        : parseToday(file.text, { file: path });
      if (strict) {
        assertProjectWritable(document);
        if (
          document.warnings.some((issue) =>
            ['INVALID_DATE', 'INVALID_HEADER', 'ORPHAN_TASK'].includes(issue.code),
          )
        )
          throw new ProjectFormatError('任务日期或周文件格式有误，请先修复后管理项目');
      }
      results.push({
        file,
        document,
        tasks: document.nodes.flatMap((node) =>
          node.kind === 'task' || node.kind === 'archivedTask' ? [node] : [],
        ),
      });
    }
    return results;
  }

  private async sourceRevisions() {
    const directory = await this.repository.read();
    const files = await this.scan();
    return [
      ...files.map((value) => ({ path: value.file.path, revision: value.file.revision })),
      { path: this.repository.path, revision: directory.revision },
    ];
  }

  get(): Promise<ProjectSnapshot> {
    return this.coordinator.run(
      async () => {
        const directory = await this.repository.read();
        let files: Awaited<ReturnType<ProjectService['scan']>> = [];
        try {
          files = await this.scan(false);
        } catch {
          directory.document.warnings.push({
            file: 'projects.txt',
            line: 0,
            code: 'INVALID_PROJECT',
            reason: '部分任务文件无法读取，请检查数据文件夹',
          });
        }
        const projects = directory.document.blocks.map((block) => ({
          ...block.project,
          pendingCount: 0,
          unregistered: false,
        }));
        for (const { tasks } of files)
          for (const task of tasks) {
            if (!task.projectName) continue;
            let project = projects.find((project) => project.name === task.projectName);
            if (!project) {
              project = {
                name: task.projectName,
                status: 'active',
                pendingCount: 0,
                unregistered: true,
              };
              projects.push(project);
            }
            if (task.kind === 'task' && !task.completed) project.pendingCount++;
          }
        return {
          revision: directory.revision,
          projects,
          warnings: [
            ...directory.document.warnings,
            ...files.flatMap((file) =>
              file.document.warnings.filter((issue) => issue.code === 'INVALID_PROJECT'),
            ),
          ],
          recovery: this.renames.getRecovery(),
        };
      },
      { readOnly: true },
    );
  }

  async assertTarget(name: string | null | undefined): Promise<void> {
    if (name == null) return;
    name = normalizeProjectName(name);
    const read = await this.repository.read();
    assertProjectWritable(read.document);
    const project = read.document.blocks.find((block) => block.project.name === name)?.project;
    if (!project) throw new ProjectError('PROJECT_NOT_FOUND', '请先创建或登记目标项目');
    if (project.status !== 'active')
      throw new ProjectError('PROJECT_HAS_PENDING', '请先在项目管理中恢复该项目');
  }

  create(input: ProjectMutation & { color?: string | undefined }): Promise<ProjectSnapshot> {
    return this.coordinator.run(async () => {
      const name = normalizeProjectName(input.name);
      await this.repository.update(input.expectedRevision, (document) => {
        if (document.blocks.some((block) => block.project.name === name))
          throw new ProjectError('PROJECT_NAME_EXISTS', '项目名称已存在');
        document.blocks.push({
          project: { name, status: 'active' },
          line: 0,
          lines: [
            `## ${name}`,
            '状态: active',
            ...(input.color ? [`颜色: ${input.color}`] : []),
            '',
          ],
        });
        document.endsWithEol = true;
      });
      return this.get();
    });
  }

  update(
    input: ProjectMutation & {
      status?: ProjectStatus | undefined;
      color?: string | null | undefined;
    },
  ): Promise<ProjectSnapshot> {
    return this.coordinator.run(async () => {
      if (input.status === 'archived') {
        const files = await this.scan();
        if (
          files.some((file) =>
            file.tasks.some(
              (task) => task.projectName === input.name && task.kind === 'task' && !task.completed,
            ),
          )
        )
          throw new ProjectError('PROJECT_HAS_PENDING', '项目还有未完成待办，请先完成或移出');
      }
      await this.repository.update(input.expectedRevision, (document) => {
        const block = document.blocks.find((block) => block.project.name === input.name);
        if (!block) throw new ProjectError('PROJECT_NOT_FOUND', '项目不存在');
        if (input.status)
          block.lines = block.lines.map((line) =>
            line.startsWith('状态:') ? `状态: ${input.status}` : line,
          );
        if (input.color !== undefined) {
          block.lines = block.lines.filter((line) => !line.startsWith('颜色:'));
          if (input.color) block.lines.splice(2, 0, `颜色: ${input.color}`);
        }
      });
      return this.get();
    });
  }

  reorder(input: { names: string[]; expectedRevision: string }): Promise<ProjectSnapshot> {
    return this.coordinator.run(async () => {
      await this.repository.update(input.expectedRevision, (document) => {
        if (
          input.names.length !== document.blocks.length ||
          new Set(input.names).size !== input.names.length ||
          input.names.some((name) => !document.blocks.some((block) => block.project.name === name))
        )
          throw new RangeError('项目排序已过期');
        document.blocks = input.names.map((name) =>
          document.blocks.find((block) => block.project.name === name)!,
        );
      });
      return this.get();
    });
  }

  deleteEmpty(input: ProjectMutation): Promise<ProjectSnapshot> {
    return this.coordinator.run(async () => {
      if (
        (await this.scan()).some((file) =>
          file.tasks.some((task) => task.projectName === input.name),
        )
      )
        throw new ProjectError('PROJECT_IN_USE', '项目仍被待办或历史完成记录引用，不能删除');
      await this.repository.update(input.expectedRevision, (document) => {
        const index = document.blocks.findIndex((block) => block.project.name === input.name);
        if (index < 0) throw new ProjectError('PROJECT_NOT_FOUND', '项目不存在');
        // Preserve unrecognised lines even when deleting an otherwise empty project.
        const [block] = document.blocks.splice(index, 1);
        const unknown = block!.lines
          .slice(1)
          .filter((line) => !line.startsWith('状态:') && !line.startsWith('颜色:'));
        if (index > 0) document.blocks[index - 1]!.lines.push(...unknown);
        else document.preamble.push(...unknown);
      });
      return this.get();
    });
  }

  previewRename(input: { oldName: string; newName: string; expectedRevision: string }) {
    return this.coordinator.run(async () => {
      await this.archive?.reconcileToToday('before-mutation');
      const directory = await this.repository.read();
      if (input.expectedRevision !== directory.revision)
        throw new FileChangedError(this.repository.path);
      assertProjectWritable(directory.document);
      const oldName = normalizeProjectName(input.oldName),
        newName = normalizeProjectName(input.newName);
      const block = directory.document.blocks.find((block) => block.project.name === oldName);
      if (!block || directory.text === null)
        throw new ProjectError('PROJECT_NOT_FOUND', '原项目不存在，请先登记');
      const scanned = await this.scan();
      if (
        newName !== oldName &&
        (directory.document.blocks.some((block) => block.project.name === newName) ||
          scanned.some((file) => file.tasks.some((task) => task.projectName === newName)))
      )
        throw new ProjectError('PROJECT_NAME_EXISTS', '新名称已被项目或历史任务使用，不能隐式合并');
      let taskCount = 0;
      const files = scanned.map(({ file, tasks }) => {
        const replacements = new Map<number, string>();
        for (const task of tasks)
          if (task.projectName === oldName && oldName !== newName) {
            replacements.set(task.line, replaceProjectField(task.raw, newName));
            taskCount++;
          }
        return { ...file, next: replaceLines(file.text, replacements) };
      });
      files.push({
        path: this.repository.path,
        revision: directory.revision,
        text: directory.text,
        eol: directory.document.eol,
        endsWithEol: directory.document.endsWithEol,
        next: replaceLines(directory.text, new Map([[block.line, `## ${newName}`]])),
      });
      return this.renames.preview(
        oldName,
        newName,
        files,
        [
          ...scanned.map((file) => ({ path: file.file.path, revision: file.file.revision })),
          { path: this.repository.path, revision: directory.revision },
        ],
        taskCount,
      );
    });
  }

  rename(token: string): Promise<ProjectSnapshot> {
    return this.coordinator.run(async () => {
      await this.renames.execute(token);
      return this.get();
    });
  }

  async retryRecovery(): Promise<ProjectSnapshot> {
    await this.renames.recover();
    return this.get();
  }
}

const replaceLines = (text: string, replacements: Map<number, string>): string => {
  const parts = text.split(/(\r?\n)/);
  for (const [line, raw] of replacements) parts[line * 2] = raw;
  return parts.join('');
};
