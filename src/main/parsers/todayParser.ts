import type { ParseWarning } from '../../shared/domain';
import { isValidLocalDate } from '../../shared/dateUtils';
import { isValidLocalTime } from '../../shared/validation';
import { decodeText, encodeLines, type LineEnding } from './lineEndings';

const HEADER_RE = /^# (\d{4}-\d{2}-\d{2})$/;
const TASK_RE = /^- \[([ xX])\] (.+)$/;
const VALID_TRAILING_TIME_RE = /\s@([0-2]\d:[0-5]\d)$/;
const TIME_LIKE_SUFFIX_RE = /\s@(\d{2}:\d{2})$/;

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
  completedAt?: string;
}

export interface TodayBlankNode extends TodayNodeBase {
  kind: 'blank';
}

export interface TodayUnknownNode extends TodayNodeBase {
  kind: 'unknown';
  reason: string;
}

export type TodayNode = TodayHeaderNode | TodayTaskNode | TodayBlankNode | TodayUnknownNode;

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

  if (decoded.hadBom) {
    warnings.push(warning(file, 0, 'UNKNOWN_LINE', '检测到 UTF-8 BOM，写回时将移除'));
  }

  decoded.lines.forEach((raw, line) => {
    if (raw === '') {
      nodes.push({ kind: 'blank', raw, line });
      return;
    }

    const header = HEADER_RE.exec(raw);
    if (header) {
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

      const node: TodayTaskNode = { kind: 'task', raw, line, completed, content };
      if (completedAt !== undefined) node.completedAt = completedAt;
      nodes.push(node);
      return;
    }

    const code: ParseWarning['code'] = raw.startsWith('#') ? 'INVALID_HEADER' : 'UNKNOWN_LINE';
    const reason = code === 'INVALID_HEADER' ? '无法识别的日期头' : '无法识别的 today.txt 行';
    nodes.push({ kind: 'unknown', raw, line, reason });
    warnings.push(warning(file, line, code, reason));
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
  completedAt?: string,
): string => `- [${completed ? 'x' : ' '}] ${content}${completedAt ? ` @${completedAt}` : ''}`;

export const serializeToday = (document: TodayDocument): string =>
  encodeLines(
    document.nodes.map((node) => node.raw),
    document.eol,
    document.endsWithEol,
  );

export const reindexTodayNodes = (nodes: TodayNode[]): void => {
  nodes.forEach((node, line) => {
    node.line = line;
  });
};
