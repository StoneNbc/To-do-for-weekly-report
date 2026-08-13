import type { TaskLocator, TodaySnapshot, TodayTaskView } from '../../shared/domain';
import { getLocalDate } from '../../shared/dateUtils';
import { assertValidIsoDate, assertValidLocalTime, assertValidTaskContent } from '../../shared/validation';
import {
  formatTodayTask,
  parseToday,
  reindexTodayNodes,
  serializeToday,
  type TodayDocument,
  type TodayTaskNode,
} from '../parsers/todayParser';
import { FileChangedError, TextFileStore, type TextFileSnapshot } from './textFileStore';

export class TaskLineNotFoundError extends Error {
  readonly code = 'NOT_FOUND' as const;

  constructor(readonly line: number) {
    super(`第 ${line + 1} 行不是可操作的任务`);
    this.name = 'TaskLineNotFoundError';
  }
}

export class InvalidTodayFileError extends Error {
  readonly code = 'INVALID_FILE' as const;

  constructor(message: string) {
    super(message);
    this.name = 'InvalidTodayFileError';
  }
}

export interface TodayReadResult {
  file: TextFileSnapshot;
  document: TodayDocument;
  snapshot: TodaySnapshot;
}

export interface TodayTaskChanges {
  content?: string;
  completed?: boolean;
  completedAt?: string | null;
}

export class TodayRepository {
  constructor(
    readonly path: string,
    private readonly store = new TextFileStore(),
    private readonly currentDate: () => string = getLocalDate,
  ) {}

  async initialize(date = this.currentDate()): Promise<TodayReadResult> {
    assertValidIsoDate(date);
    try {
      return await this.read();
    } catch (error) {
      if (!isMissingFile(error)) throw error;
      await this.store.writeAtomic(this.path, `# ${date}\n`);
      return this.read();
    }
  }

  async read(): Promise<TodayReadResult> {
    const file = await this.store.read(this.path);
    return this.fromFile(file);
  }

  async addTask(content: string, expectedRevision: string | null = null): Promise<TodayReadResult> {
    const normalized = assertValidTaskContent(content);
    const result = await this.store.update(this.path, expectedRevision, (file) => {
      const document = parseToday(file.text, { file: this.path });
      const newNode: TodayTaskNode = {
        kind: 'task',
        raw: formatTodayTask(normalized, false),
        line: 0,
        completed: false,
        content: normalized,
      };
      const lastTask = document.nodes.reduce(
        (last, node, index) => (node.kind === 'task' ? index : last),
        -1,
      );
      const header = document.nodes.findIndex((node) => node.kind === 'header');
      const insertion = lastTask >= 0 ? lastTask + 1 : header >= 0 ? header + 1 : document.nodes.length;
      document.nodes.splice(insertion, 0, newNode);
      reindexTodayNodes(document.nodes);
      return { text: serializeToday(document), result: undefined };
    });
    return this.fromFile(result.snapshot);
  }

  async updateTask(locator: TaskLocator, changes: TodayTaskChanges): Promise<TodayReadResult> {
    if (locator.line < 0 || !Number.isInteger(locator.line)) throw new TaskLineNotFoundError(locator.line);
    const result = await this.store.update(this.path, locator.revision, (file) => {
      const document = parseToday(file.text, { file: this.path });
      const node = document.nodes[locator.line];
      if (!node || node.kind !== 'task') throw new TaskLineNotFoundError(locator.line);

      const content = changes.content === undefined ? node.content : assertValidTaskContent(changes.content);
      const completed = changes.completed ?? node.completed;
      let completedAt = changes.completedAt === undefined ? node.completedAt : changes.completedAt ?? undefined;
      if (!completed) completedAt = undefined;
      if (completedAt !== undefined) assertValidLocalTime(completedAt);
      node.content = content;
      node.completed = completed;
      if (completedAt === undefined) delete node.completedAt;
      else node.completedAt = completedAt;
      node.raw = formatTodayTask(content, completed, completedAt);
      return { text: serializeToday(document), result: undefined };
    });
    return this.fromFile(result.snapshot);
  }

  async deleteTask(locator: TaskLocator): Promise<TodayReadResult> {
    const result = await this.store.update(this.path, locator.revision, (file) => {
      const document = parseToday(file.text, { file: this.path });
      const node = document.nodes[locator.line];
      if (!node || node.kind !== 'task') throw new TaskLineNotFoundError(locator.line);
      document.nodes.splice(locator.line, 1);
      reindexTodayNodes(document.nodes);
      return { text: serializeToday(document), result: undefined };
    });
    return this.fromFile(result.snapshot);
  }

  async rollOver(expectedRevision: string, targetDate: string): Promise<TodayReadResult> {
    assertValidIsoDate(targetDate);
    const result = await this.store.update(this.path, expectedRevision, (file) => {
      const document = parseToday(file.text, { file: this.path });
      const header = document.nodes.find((node) => node.kind === 'header');
      if (!header || document.fileDate === null) {
        throw new InvalidTodayFileError('today.txt 缺少合法日期头，无法自动归档');
      }
      header.date = targetDate;
      header.raw = `# ${targetDate}`;
      document.fileDate = targetDate;
      document.nodes = document.nodes.filter(
        (node) => node.kind !== 'task' || !node.completed,
      );
      reindexTodayNodes(document.nodes);
      return { text: serializeToday(document), result: undefined };
    });
    return this.fromFile(result.snapshot);
  }

  private fromFile(file: TextFileSnapshot): TodayReadResult {
    const document = parseToday(file.text, { file: this.path });
    const tasks: TodayTaskView[] = document.nodes
      .filter((node): node is TodayTaskNode => node.kind === 'task')
      .map((node) => {
        const task: TodayTaskView = {
          locator: { line: node.line, revision: file.revision },
          content: node.content,
          completed: node.completed,
        };
        if (node.completedAt !== undefined) task.completedAt = node.completedAt;
        return task;
      });
    return {
      file,
      document,
      snapshot: {
        fileDate: document.fileDate ?? '',
        currentDate: this.currentDate(),
        revision: file.revision,
        tasks,
        warnings: document.warnings,
      },
    };
  }
}

const isMissingFile = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT';

export { FileChangedError };
