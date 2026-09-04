import type { ParseWarning } from '../../shared/domain';
import {
  formatChineseWeekday,
  getDateFromIsoWeek,
  getIsoWeekInfo,
  isValidLocalDate,
} from '../../shared/dateUtils';
import { isValidLocalTime } from '../../shared/validation';
import { decodeText, encodeLines, type LineEnding } from './lineEndings';
import { formatTaskDetailLine, parseTaskDetailLine } from './taskDetails';

// 周文件中的 MM-DD 无法独立判断年份，调用方必须提供目标 ISO 周上下文。
const WEEK_HEADER_RE = /^# 第(\d{1,2})周 \((\d{4}-\d{2}-\d{2}) ~ (\d{4}-\d{2}-\d{2})\)$/;
const DAY_HEADER_RE = /^## (周[一二三四五六日]) (\d{2})-(\d{2})$/;
const TASK_RE = /^- (.+)$/;
const VALID_TRAILING_TIME_RE = /\s@([0-2]\d:[0-5]\d)$/;
const TIME_LIKE_SUFFIX_RE = /\s@(\d{2}:\d{2})$/;
const VALID_ADDED_DATE_RE = /\s@添加:(\d{4}-\d{2}-\d{2})$/;
const ADDED_DATE_LIKE_RE = /\s@添加:(\S+)$/;

interface WeekNodeBase {
  raw: string;
  line: number;
}

export interface WeekHeaderNode extends WeekNodeBase {
  kind: 'weekHeader';
  isoWeek: number;
  start: string;
  end: string;
}

export interface DayHeaderNode extends WeekNodeBase {
  kind: 'dayHeader';
  date: string;
  weekdayLabel: string;
}

export interface ArchivedTaskNode extends WeekNodeBase {
  kind: 'archivedTask';
  date: string;
  content: string;
  addedDate?: string;
  completedAt?: string;
}

export interface WeekTaskDetailNode extends WeekNodeBase {
  kind: 'taskDetail';
  content: string;
}

export interface WeekBlankNode extends WeekNodeBase {
  kind: 'blank';
}

export interface WeekUnknownNode extends WeekNodeBase {
  kind: 'unknown';
  reason: string;
}

export type WeekNode =
  | WeekHeaderNode
  | DayHeaderNode
  | ArchivedTaskNode
  | WeekTaskDetailNode
  | WeekBlankNode
  | WeekUnknownNode;

export interface WeekDocument {
  isoYear: number;
  isoWeek: number;
  nodes: WeekNode[];
  eol: LineEnding;
  endsWithEol: boolean;
  hadBom: boolean;
  warnings: ParseWarning[];
}

export interface ParseWeekOptions {
  isoYear: number;
  isoWeek: number;
  file?: string;
}

const makeWarning = (
  file: string,
  line: number,
  code: ParseWarning['code'],
  reason: string,
): ParseWarning => ({ file, line, code, reason });

const resolveMonthDay = (
  isoYear: number,
  isoWeek: number,
  month: string,
  day: string,
): string | null => {
  // 在目标周七天内匹配，正确处理跨自然年的 ISO 周。
  for (let weekday = 1; weekday <= 7; weekday += 1) {
    const date = getDateFromIsoWeek(isoYear, isoWeek, weekday);
    if (date.slice(5, 7) === month && date.slice(8, 10) === day) return date;
  }
  return null;
};

/**
 * 把周文件文本解析成轻量 AST（节点数组）。
 * 与 todayParser 类似，节点保留 raw 以便未知行逐字保真；
 * 周文件中的 MM-DD 日期需要结合目标 ISO 周上下文才能还原完整日期。
 */
export const parseWeek = (text: string, options: ParseWeekOptions): WeekDocument => {
  // Validates the week, including rejecting W53 in years that only have 52 weeks.
  getDateFromIsoWeek(options.isoYear, options.isoWeek, 1);
  const file =
    options.file ?? `week-${options.isoYear}-W${String(options.isoWeek).padStart(2, '0')}.txt`;
  const decoded = decodeText(text);
  const nodes: WeekNode[] = [];
  const warnings: ParseWarning[] = [];
  const seenDates = new Set<string>();
  let currentDate: string | null = null;
  let hasWeekHeader = false;
  let acceptsTaskDetail = false;

  if (decoded.hadBom) {
    warnings.push(makeWarning(file, 0, 'UNKNOWN_LINE', '检测到 UTF-8 BOM，写回时将移除'));
  }

  decoded.lines.forEach((raw, line) => {
    if (raw === '') {
      nodes.push({ kind: 'blank', raw, line });
      acceptsTaskDetail = false;
      return;
    }

    const weekHeader = WEEK_HEADER_RE.exec(raw);
    if (weekHeader) {
      acceptsTaskDetail = false;
      const parsedWeek = Number(weekHeader[1]);
      const start = weekHeader[2] ?? '';
      const end = weekHeader[3] ?? '';
      const expectedStart = getDateFromIsoWeek(options.isoYear, options.isoWeek, 1);
      const expectedEnd = getDateFromIsoWeek(options.isoYear, options.isoWeek, 7);
      const valid =
        line === 0 &&
        !hasWeekHeader &&
        parsedWeek === options.isoWeek &&
        isValidLocalDate(start) &&
        isValidLocalDate(end) &&
        start === expectedStart &&
        end === expectedEnd;
      if (!valid) {
        const reason = hasWeekHeader ? '周文件包含重复周头' : '周头与目标 ISO 周不一致';
        nodes.push({ kind: 'unknown', raw, line, reason });
        warnings.push(
          makeWarning(file, line, hasWeekHeader ? 'DUPLICATE_HEADER' : 'INVALID_HEADER', reason),
        );
      } else {
        hasWeekHeader = true;
        nodes.push({ kind: 'weekHeader', raw, line, isoWeek: parsedWeek, start, end });
      }
      currentDate = null;
      return;
    }

    const dayHeader = DAY_HEADER_RE.exec(raw);
    if (dayHeader) {
      acceptsTaskDetail = false;
      const weekdayLabel = dayHeader[1] ?? '';
      const date = resolveMonthDay(
        options.isoYear,
        options.isoWeek,
        dayHeader[2] ?? '',
        dayHeader[3] ?? '',
      );
      if (date === null) {
        const reason = '日期标题不属于目标 ISO 周';
        nodes.push({ kind: 'unknown', raw, line, reason });
        warnings.push(makeWarning(file, line, 'INVALID_DATE', reason));
        currentDate = null;
        return;
      }

      // 重复日期段是合法可读数据：仅提示，不合并、不删除，也不对任务去重。
      if (seenDates.has(date)) {
        warnings.push(makeWarning(file, line, 'DUPLICATE_HEADER', `日期 ${date} 存在重复段`));
      }
      seenDates.add(date);
      const actualWeekday = formatChineseWeekday(date);
      if (actualWeekday !== weekdayLabel) {
        warnings.push(
          makeWarning(
            file,
            line,
            'INVALID_DATE',
            `日期标题星期为 ${weekdayLabel}，实际应为 ${actualWeekday}`,
          ),
        );
      }
      currentDate = date;
      nodes.push({ kind: 'dayHeader', raw, line, date, weekdayLabel });
      return;
    }

    const task = TASK_RE.exec(raw);
    if (task) {
      if (currentDate === null) {
        // 孤立任务不能安全推断归属日期，因此作为 unknown 节点原样保存。
        const reason = '归档任务上方没有合法日期标题';
        nodes.push({ kind: 'unknown', raw, line, reason });
        warnings.push(makeWarning(file, line, 'ORPHAN_TASK', reason));
        return;
      }

      let content = task[1] ?? '';
      let completedAt: string | undefined;
      const trailing = VALID_TRAILING_TIME_RE.exec(content);
      const timeLikeSuffix = TIME_LIKE_SUFFIX_RE.exec(content);
      if (trailing && isValidLocalTime(trailing[1] ?? '')) {
        completedAt = trailing[1];
        content = content.slice(0, trailing.index);
      } else if (timeLikeSuffix) {
        warnings.push(
          makeWarning(file, line, 'INVALID_TIME', `无效的完成时间：${timeLikeSuffix[1]}`),
        );
      }
      let addedDate: string | undefined;
      const added = VALID_ADDED_DATE_RE.exec(content);
      const addedLike = ADDED_DATE_LIKE_RE.exec(content);
      if (added && isValidLocalDate(added[1] ?? '')) {
        addedDate = added[1];
        content = content.slice(0, added.index);
      } else if (addedLike) {
        warnings.push(
          makeWarning(file, line, 'INVALID_ADDED_DATE', `无效的添加日期：${addedLike[1]}`),
        );
      }
      const node: ArchivedTaskNode = {
        kind: 'archivedTask',
        raw,
        line,
        date: currentDate,
        content,
      };
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
        const reason = '详情行上方没有可关联的归档任务';
        nodes.push({ kind: 'unknown', raw, line, reason });
        warnings.push(makeWarning(file, line, 'UNKNOWN_LINE', reason));
      }
      return;
    }

    const code: ParseWarning['code'] = raw.startsWith('#') ? 'INVALID_HEADER' : 'UNKNOWN_LINE';
    const reason = code === 'INVALID_HEADER' ? '无法识别的周文件标题' : '无法识别的周文件行';
    nodes.push({ kind: 'unknown', raw, line, reason });
    warnings.push(makeWarning(file, line, code, reason));
    acceptsTaskDetail = false;
  });

  if (!hasWeekHeader) {
    warnings.push(makeWarning(file, 0, 'INVALID_HEADER', '缺少合法的首行周头'));
  }

  return {
    isoYear: options.isoYear,
    isoWeek: options.isoWeek,
    nodes,
    eol: decoded.eol,
    endsWithEol: decoded.endsWithEol,
    hadBom: decoded.hadBom,
    warnings,
  };
};

export const formatWeekHeader = (isoYear: number, isoWeek: number): string => {
  const start = getDateFromIsoWeek(isoYear, isoWeek, 1);
  const end = getDateFromIsoWeek(isoYear, isoWeek, 7);
  return `# 第${isoWeek}周 (${start} ~ ${end})`;
};

export const formatDayHeader = (date: string): string => {
  const info = getIsoWeekInfo(date);
  getDateFromIsoWeek(info.isoYear, info.isoWeek, 1);
  return `## ${formatChineseWeekday(date)} ${date.slice(5)}`;
};

export const formatArchivedTask = (
  content: string,
  addedDate?: string,
  completedAt?: string,
): string =>
  `- ${content}${addedDate ? ` @添加:${addedDate}` : ''}${completedAt ? ` @${completedAt}` : ''}`;

export const createWeekTaskDetailNodes = (details: string, startLine = 0): WeekTaskDetailNode[] =>
  details === ''
    ? []
    : details.split('\n').map((content, index) => ({
        kind: 'taskDetail',
        raw: formatTaskDetailLine(content),
        line: startLine + index,
        content,
      }));

export const getWeekTaskBlockEnd = (nodes: WeekNode[], rootIndex: number): number => {
  if (nodes[rootIndex]?.kind !== 'archivedTask') return rootIndex;
  let end = rootIndex + 1;
  while (nodes[end]?.kind === 'taskDetail') end += 1;
  return end;
};

export const readWeekTaskDetails = (nodes: WeekNode[], rootIndex: number): string =>
  nodes
    .slice(rootIndex + 1, getWeekTaskBlockEnd(nodes, rootIndex))
    .filter((node): node is WeekTaskDetailNode => node.kind === 'taskDetail')
    .map((node) => node.content)
    .join('\n');

export const serializeWeek = (document: WeekDocument): string =>
  // 直接拼接节点 raw，未被 Repository 修改的行不会被格式化或丢失。
  encodeLines(
    document.nodes.map((node) => node.raw),
    document.eol,
    document.endsWithEol,
  );

export const reindexWeekNodes = (nodes: WeekNode[]): void => {
  nodes.forEach((node, line) => {
    node.line = line;
  });
};
