import type { ParseWarning } from '../../shared/domain';
import { isValidLocalDate } from '../../shared/dateUtils';
import { isValidLocalTime } from '../../shared/validation';
import { decodeText, encodeLines, type LineEnding } from './lineEndings';
import { formatTaskDetailLine, parseTaskDetailLine } from './taskDetails';

// 解析器生成保留 raw 的轻量 AST。Repository 只重写被编辑的节点，未知行原样保留。
const HEADER_RE = /^# (\d{4}-\d{2}-\d{2})$/;
const TASK_RE = /^- \[([ xX])\] (.+)$/;
const VALID_TRAILING_TIME_RE = /\s@([0-2]\d:[0-5]\d)$/;
const TIME_LIKE_SUFFIX_RE = /\s@(\d{2}:\d{2})$/;
const VALID_ADDED_DATE_RE = /\s@添加:(\d{4}-\d{2}-\d{2})$/;
const ADDED_DATE_LIKE_RE = /\s@添加:(\S+)$/;

interface TodayNodeBase {
  raw: string;
  line: number;
}

export interface TodayHeaderNode extends TodayNodeBase {
  kind: 'header';
  date: string;
}

export interface TodayTaskNode extends TodayNodeBase {
  kind: 'task';
  completed: boolean;
  content: string;
  addedDate?: string;
  completedAt?: string;
}

export interface TodayTaskDetailNode extends TodayNodeBase {
  kind: 'taskDetail';
  content: string;
}

export interface TodayBlankNode extends TodayNodeBase {
  kind: 'blank';
}

export interface TodayUnknownNode extends TodayNodeBase {
  kind: 'unknown';
  reason: string;
}

export type TodayNode =
  TodayHeaderNode | TodayTaskNode | TodayTaskDetailNode | TodayBlankNode | TodayUnknownNode;

export interface TodayDocument {
  nodes: TodayNode[];
  fileDate: string | null;
  eol: LineEnding;
  endsWithEol: boolean;
  hadBom: boolean;
  warnings: ParseWarning[];
}

export interface ParseTodayOptions {
  file?: string;
}

const warning = (
  file: string,
  line: number,
  code: ParseWarning['code'],
  reason: string,
): ParseWarning => ({ file, line, code, reason });

export const parseToday = (text: string, options: ParseTodayOptions = {}): TodayDocument => {
  const file = options.file ?? 'today.txt';
  const decoded = decodeText(text);
  const nodes: TodayNode[] = [];
  const warnings: ParseWarning[] = [];
  let fileDate: string | null = null;
  let acceptsTaskDetail = false;

  if (decoded.hadBom) {
    warnings.push(warning(file, 0, 'UNKNOWN_LINE', '检测到 UTF-8 BOM，写回时将移除'));
  }

  decoded.lines.forEach((raw, line) => {
    if (raw === '') {
      nodes.push({ kind: 'blank', raw, line });
      acceptsTaskDetail = false;
      return;
    }

    const header = HEADER_RE.exec(raw);
    if (header) {
      acceptsTaskDetail = false;
      const date = header[1] ?? '';
      if (line !== 0 || fileDate !== null) {
        const reason = '日期头只能出现在第一行且只能有一个';
        nodes.push({ kind: 'unknown', raw, line, reason });
        warnings.push(warning(file, line, 'DUPLICATE_HEADER', reason));
      } else if (!isValidLocalDate(date)) {
        const reason = `日期头包含无效日期：${date}`;
        nodes.push({ kind: 'unknown', raw, line, reason });
        warnings.push(warning(file, line, 'INVALID_DATE', reason));
      } else {
        fileDate = date;
        nodes.push({ kind: 'header', raw, line, date });
      }
      return;
    }

    const task = TASK_RE.exec(raw);
    if (task) {
      const completed = (task[1] ?? '').toLowerCase() === 'x';
      let content = task[2] ?? '';
      let completedAt: string | undefined;
      const trailing = VALID_TRAILING_TIME_RE.exec(content);
      const timeLikeSuffix = TIME_LIKE_SUFFIX_RE.exec(content);
      // 只有已完成任务才把末尾 @HH:mm 解释为完成时间；其他类似文本仍保留在正文中。
      if (completed && trailing && isValidLocalTime(trailing[1] ?? '')) {
        completedAt = trailing[1];
        content = content.slice(0, trailing.index);
      } else if (timeLikeSuffix) {
        warnings.push(
          warning(
            file,
            line,
            'INVALID_TIME',
            completed ? `无效的完成时间：${timeLikeSuffix[1]}` : '未完成任务不能包含完成时间',
          ),
        );
      }

      let addedDate: string | undefined;
      const added = VALID_ADDED_DATE_RE.exec(content);
      const addedLike = ADDED_DATE_LIKE_RE.exec(content);
      if (added && isValidLocalDate(added[1] ?? '')) {
        addedDate = added[1];
        content = content.slice(0, added.index);
      } else if (addedLike) {
        warnings.push(warning(file, line, 'INVALID_ADDED_DATE', `无效的添加日期：${addedLike[1]}`));
      }

      const node: TodayTaskNode = { kind: 'task', raw, line, completed, content };
      if (addedDate !== undefined) node.addedDate = addedDate;
      if (completedAt !== undefined) node.completedAt = completedAt;
      nodes.push(node);
      acceptsTaskDetail = true;
      return;
    }

    const detail = parseTaskDetailLine(raw);
    if (detail !== null) {
      if (acceptsTaskDetail) {
        nodes.push({ kind: 'taskDetail', raw, line, content: detail });
      } else {
        const reason = '详情行上方没有可关联的任务';
        nodes.push({ kind: 'unknown', raw, line, reason });
        warnings.push(warning(file, line, 'UNKNOWN_LINE', reason));
      }
      return;
    }

    const code: ParseWarning['code'] = raw.startsWith('#') ? 'INVALID_HEADER' : 'UNKNOWN_LINE';
    const reason = code === 'INVALID_HEADER' ? '无法识别的日期头' : '无法识别的 today.txt 行';
    nodes.push({ kind: 'unknown', raw, line, reason });
    warnings.push(warning(file, line, code, reason));
    acceptsTaskDetail = false;
  });

  if (fileDate === null) {
    warnings.push(warning(file, 0, 'INVALID_HEADER', '缺少合法的首行日期头'));
  }

  return {
    nodes,
    fileDate,
    eol: decoded.eol,
    endsWithEol: decoded.endsWithEol,
    hadBom: decoded.hadBom,
    warnings,
  };
};

export const formatTodayTask = (
  content: string,
  completed: boolean,
  addedDate?: string,
  completedAt?: string,
): string =>
  `- [${completed ? 'x' : ' '}] ${content}${addedDate ? ` @添加:${addedDate}` : ''}${completedAt ? ` @${completedAt}` : ''}`;

export const createTodayTaskDetailNodes = (
  details: string,
  startLine = 0,
): TodayTaskDetailNode[] =>
  details === ''
    ? []
    : details.split('\n').map((content, index) => ({
        kind: 'taskDetail',
        raw: formatTaskDetailLine(content),
        line: startLine + index,
        content,
      }));

export const getTodayTaskBlockEnd = (nodes: TodayNode[], rootIndex: number): number => {
  if (nodes[rootIndex]?.kind !== 'task') return rootIndex;
  let end = rootIndex + 1;
  while (nodes[end]?.kind === 'taskDetail') end += 1;
  return end;
};

export const readTodayTaskDetails = (nodes: TodayNode[], rootIndex: number): string =>
  nodes
    .slice(rootIndex + 1, getTodayTaskBlockEnd(nodes, rootIndex))
    .filter((node): node is TodayTaskDetailNode => node.kind === 'taskDetail')
    .map((node) => node.content)
    .join('\n');

export const serializeToday = (document: TodayDocument): string =>
  // raw 是序列化的事实来源，确保解析后未修改的文本逐行保真。
  encodeLines(
    document.nodes.map((node) => node.raw),
    document.eol,
    document.endsWithEol,
  );

export const reindexTodayNodes = (nodes: TodayNode[]): void => {
  // TaskLocator 使用物理行号，任何插入或删除后都必须同步重建索引。
  nodes.forEach((node, line) => {
    node.line = line;
  });
};
