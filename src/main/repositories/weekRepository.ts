import { join } from 'node:path';
import type {
  DayRecordSnapshot,
  HistoricalTaskView,
  TaskLocator,
  WeeklyDayGroup,
  WeeklySnapshot,
} from '../../shared/domain';
import {
  compareLocalDates,
  formatChineseWeekday,
  getDateFromIsoWeek,
  getIsoWeekInfo,
  getWeekFileName,
} from '../../shared/dateUtils';
import {
  assertValidIsoDate,
  assertValidLocalTime,
  assertValidTaskContent,
} from '../../shared/validation';
import {
  formatArchivedTask,
  formatDayHeader,
  formatWeekHeader,
  parseWeek,
  reindexWeekNodes,
  serializeWeek,
  type ArchivedTaskNode,
  type WeekDocument,
  type WeekNode,
} from '../parsers/weekParser';
import {
  computeRevision,
  FileChangedError,
  TextFileStore,
  type TextFileSnapshot,
} from './textFileStore';
import { TaskLineNotFoundError } from './todayRepository';

export interface WeekReadResult {
  path: string;
  file: TextFileSnapshot | null;
  document: WeekDocument;
}

export interface HistoricalTaskInput {
  content: string;
  completedAt?: string;
}

export interface ArchivedTaskInput {
  content: string;
  completedAt?: string;
}

export class WeekRepository {
  constructor(
    readonly weeksDirectory: string,
    private readonly store = new TextFileStore(),
  ) {}

  getPath(isoYear: number, isoWeek: number): string {
    return join(this.weeksDirectory, getWeekFileName(isoYear, isoWeek));
  }

  async readWeek(isoYear: number, isoWeek: number): Promise<WeekReadResult> {
    const path = this.getPath(isoYear, isoWeek);
    try {
      const file = await this.store.read(path);
      return { path, file, document: parseWeek(file.text, { isoYear, isoWeek, file: path }) };
    } catch (error) {
      if (!isMissingFile(error)) throw error;
      // 读取不存在的历史周是正常空状态；只有首次写入时才真正创建文件。
      return { path, file: null, document: createEmptyWeekDocument(isoYear, isoWeek) };
    }
  }

  async getDay(date: string): Promise<DayRecordSnapshot> {
    assertValidIsoDate(date);
    const { isoYear, isoWeek } = getIsoWeekInfo(date);
    const read = await this.readWeek(isoYear, isoWeek);
    const revision = read.file?.revision ?? computeRevision('');
    return this.daySnapshot(date, revision, read.document);
  }

  async getWeekSnapshot(isoYear: number, isoWeek: number): Promise<WeeklySnapshot> {
    const read = await this.readWeek(isoYear, isoWeek);
    const groupsByDate = new Map<string, WeeklyDayGroup>();
    for (const node of read.document.nodes) {
      if (node.kind !== 'archivedTask') continue;
      let group = groupsByDate.get(node.date);
      if (!group) {
        group = { date: node.date, weekdayLabel: formatChineseWeekday(node.date), tasks: [] };
        groupsByDate.set(node.date, group);
      }
      const task: { date: string; content: string; time?: string } = {
        date: node.date,
        content: node.content,
      };
      if (node.completedAt !== undefined) task.time = node.completedAt;
      // 按节点出现顺序追加，允许正文和时间完全相同的重复任务。
      group.tasks.push(task);
    }
    const groups = [...groupsByDate.values()].sort((a, b) => compareLocalDates(a.date, b.date));
    return {
      isoYear,
      isoWeek,
      weekStart: getDateFromIsoWeek(isoYear, isoWeek, 1),
      weekEnd: getDateFromIsoWeek(isoYear, isoWeek, 7),
      revision: read.file?.revision ?? null,
      groups,
      total: groups.reduce((sum, group) => sum + group.tasks.length, 0),
    };
  }

  async addHistoricalTask(date: string, input: HistoricalTaskInput): Promise<DayRecordSnapshot> {
    assertValidIsoDate(date);
    const normalized = assertValidTaskContent(input.content);
    if (input.completedAt !== undefined) assertValidLocalTime(input.completedAt);
    const { isoYear, isoWeek } = getIsoWeekInfo(date);
    const path = this.getPath(isoYear, isoWeek);
    const initial = serializeWeek(createEmptyWeekDocument(isoYear, isoWeek));
    const result = await this.store.updateOrCreate(path, initial, (file) => {
      const document = parseWeek(file.text, { isoYear, isoWeek, file: path });
      insertHistoricalTask(document, date, normalized, input.completedAt);
      return { text: serializeWeek(document), result: undefined };
    });
    const document = parseWeek(result.snapshot.text, { isoYear, isoWeek, file: path });
    return this.daySnapshot(date, result.snapshot.revision, document);
  }

  async appendArchivedTasks(
    date: string,
    tasks: readonly ArchivedTaskInput[],
  ): Promise<DayRecordSnapshot> {
    assertValidIsoDate(date);
    const normalized = tasks.map((task) => {
      const value: ArchivedTaskInput = { content: assertValidTaskContent(task.content) };
      if (task.completedAt !== undefined) {
        value.completedAt = assertValidLocalTime(task.completedAt);
      }
      return value;
    });
    if (normalized.length === 0) return this.getDay(date);

    const { isoYear, isoWeek } = getIsoWeekInfo(date);
    const path = this.getPath(isoYear, isoWeek);
    const initial = serializeWeek(createEmptyWeekDocument(isoYear, isoWeek));
    const result = await this.store.updateOrCreate(path, initial, (file) => {
      const document = parseWeek(file.text, { isoYear, isoWeek, file: path });
      // 一批归档在同一个文件事务内按原顺序追加，不做正文去重。
      for (const task of normalized) {
        insertHistoricalTask(document, date, task.content, task.completedAt);
      }
      return { text: serializeWeek(document), result: undefined };
    });
    return this.daySnapshot(
      date,
      result.snapshot.revision,
      parseWeek(result.snapshot.text, { isoYear, isoWeek, file: path }),
    );
  }

  async updateHistoricalTask(
    date: string,
    locator: TaskLocator,
    input: HistoricalTaskInput,
  ): Promise<DayRecordSnapshot> {
    assertValidIsoDate(date);
    const content = assertValidTaskContent(input.content);
    if (input.completedAt !== undefined) assertValidLocalTime(input.completedAt);
    const { isoYear, isoWeek } = getIsoWeekInfo(date);
    const path = this.getPath(isoYear, isoWeek);
    const result = await this.store.update(path, locator.revision, (file) => {
      const document = parseWeek(file.text, { isoYear, isoWeek, file: path });
      const node = document.nodes[locator.line];
      // 同时核对行类型和归属日期，防止旧 locator 跨日期段误改其他任务。
      if (!node || node.kind !== 'archivedTask' || node.date !== date) {
        throw new TaskLineNotFoundError(locator.line);
      }
      node.content = content;
      if (input.completedAt === undefined) delete node.completedAt;
      else node.completedAt = input.completedAt;
      node.raw = formatArchivedTask(content, input.completedAt);
      return { text: serializeWeek(document), result: undefined };
    });
    return this.daySnapshot(
      date,
      result.snapshot.revision,
      parseWeek(result.snapshot.text, { isoYear, isoWeek, file: path }),
    );
  }

  async deleteHistoricalTask(date: string, locator: TaskLocator): Promise<DayRecordSnapshot> {
    assertValidIsoDate(date);
    const { isoYear, isoWeek } = getIsoWeekInfo(date);
    const path = this.getPath(isoYear, isoWeek);
    const result = await this.store.update(path, locator.revision, (file) => {
      const document = parseWeek(file.text, { isoYear, isoWeek, file: path });
      const node = document.nodes[locator.line];
      if (!node || node.kind !== 'archivedTask' || node.date !== date) {
        throw new TaskLineNotFoundError(locator.line);
      }
      document.nodes.splice(locator.line, 1);
      removeEmptySafeDaySection(document, date);
      reindexWeekNodes(document.nodes);
      return { text: serializeWeek(document), result: undefined };
    });
    return this.daySnapshot(
      date,
      result.snapshot.revision,
      parseWeek(result.snapshot.text, { isoYear, isoWeek, file: path }),
    );
  }

  private daySnapshot(date: string, revision: string, document: WeekDocument): DayRecordSnapshot {
    const tasks: HistoricalTaskView[] = document.nodes
      .filter(
        (node): node is ArchivedTaskNode => node.kind === 'archivedTask' && node.date === date,
      )
      .map((node) => {
        const task: HistoricalTaskView = {
          locator: { line: node.line, revision },
          date,
          content: node.content,
        };
        if (node.completedAt !== undefined) task.completedAt = node.completedAt;
        return task;
      });
    return { date, revision, tasks, warnings: document.warnings };
  }
}

const createEmptyWeekDocument = (isoYear: number, isoWeek: number): WeekDocument => {
  const header = formatWeekHeader(isoYear, isoWeek);
  const parsed = parseWeek(`${header}\n`, { isoYear, isoWeek });
  return parsed;
};

const insertHistoricalTask = (
  document: WeekDocument,
  date: string,
  content: string,
  completedAt?: string,
): void => {
  const newNode: ArchivedTaskNode = {
    kind: 'archivedTask',
    raw: formatArchivedTask(content, completedAt),
    line: 0,
    date,
    content,
  };
  if (completedAt !== undefined) newNode.completedAt = completedAt;

  const firstHeader = document.nodes.findIndex(
    (node) => node.kind === 'dayHeader' && node.date === date,
  );
  if (firstHeader >= 0) {
    // 已有日期段时插到该段最后一个任务之后，段内未知行仍保持原位置。
    let sectionEnd = firstHeader + 1;
    let insertion = firstHeader + 1;
    while (sectionEnd < document.nodes.length && document.nodes[sectionEnd]?.kind !== 'dayHeader') {
      if (document.nodes[sectionEnd]?.kind === 'archivedTask') insertion = sectionEnd + 1;
      sectionEnd += 1;
    }
    document.nodes.splice(insertion, 0, newNode);
  } else {
    // 新日期段按日期插入；跨年顺序由完整 ISO 日期比较，而不是 MM-DD 字符串。
    const laterHeader = document.nodes.findIndex(
      (node) => node.kind === 'dayHeader' && compareLocalDates(node.date, date) === 1,
    );
    const insertion = laterHeader >= 0 ? laterHeader : document.nodes.length;
    const additions: WeekNode[] = [];
    if (insertion > 0 && document.nodes[insertion - 1]?.kind !== 'blank') {
      additions.push({ kind: 'blank', raw: '', line: 0 });
    }
    additions.push({
      kind: 'dayHeader',
      raw: formatDayHeader(date),
      line: 0,
      date,
      weekdayLabel: formatChineseWeekday(date),
    });
    additions.push(newNode);
    document.nodes.splice(insertion, 0, ...additions);
  }
  reindexWeekNodes(document.nodes);
};

const removeEmptySafeDaySection = (document: WeekDocument, date: string): void => {
  for (let index = 0; index < document.nodes.length; index += 1) {
    const node = document.nodes[index];
    if (node?.kind !== 'dayHeader' || node.date !== date) continue;
    let end = index + 1;
    while (end < document.nodes.length && document.nodes[end]?.kind !== 'dayHeader') end += 1;
    const section = document.nodes.slice(index + 1, end);
    const hasTask = section.some(
      (candidate) => candidate.kind === 'archivedTask' && candidate.date === date,
    );
    const hasUnknown = section.some((candidate) => candidate.kind === 'unknown');
    // 只删除确定为空且没有未知内容的段，避免把用户手写文本一并删掉。
    if (!hasTask && !hasUnknown) {
      document.nodes.splice(index, end - index);
      return;
    }
  }
};

const isMissingFile = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT';

export { FileChangedError };
