import type { ParseWarning } from '../../shared/domain';
import {
  formatChineseWeekday,
  getDateFromIsoWeek,
  getIsoWeekInfo,
  isValidLocalDate,
} from '../../shared/dateUtils';
import { isValidLocalTime } from '../../shared/validation';
import { decodeText, encodeLines, type LineEnding } from './lineEndings';

const WEEK_HEADER_RE = /^# 第(\d{1,2})周 \((\d{4}-\d{2}-\d{2}) ~ (\d{4}-\d{2}-\d{2})\)$/;
const DAY_HEADER_RE = /^## (周[一二三四五六日]) (\d{2})-(\d{2})$/;
const TASK_RE = /^- (.+)$/;
const VALID_TRAILING_TIME_RE = /\s@([0-2]\d:[0-5]\d)$/;
const TIME_LIKE_SUFFIX_RE = /\s@(\d{2}:\d{2})$/;

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
  completedAt?: string;
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

const resolveMonthDay = (isoYear: number, isoWeek: number, month: string, day: string): string | null => {
  for (let weekday = 1; weekday <= 7; weekday += 1) {
    const date = getDateFromIsoWeek(isoYear, isoWeek, weekday);
    if (date.slice(5, 7) === month && date.slice(8, 10) === day) return date;
  }
  return null;
};

export const parseWeek = (text: string, options: ParseWeekOptions): WeekDocument => {
  // Validates the week, including rejecting W53 in years that only have 52 weeks.
  getDateFromIsoWeek(options.isoYear, options.isoWeek, 1);
  const file = options.file ?? `week-${options.isoYear}-W${String(options.isoWeek).padStart(2, '0')}.txt`;
  const decoded = decodeText(text);
  const nodes: WeekNode[] = [];
  const warnings: ParseWarning[] = [];
  const seenDates = new Set<string>();
  let currentDate: string | null = null;
  let hasWeekHeader = false;

  if (decoded.hadBom) {
    warnings.push(makeWarning(file, 0, 'UNKNOWN_LINE', '检测到 UTF-8 BOM，写回时将移除'));
  }

  decoded.lines.forEach((raw, line) => {
    if (raw === '') {
      nodes.push({ kind: 'blank', raw, line });
      return;
    }

    const weekHeader = WEEK_HEADER_RE.exec(raw);
    if (weekHeader) {
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
      const weekdayLabel = dayHeader[1] ?? '';
      const date = resolveMonthDay(options.isoYear, options.isoWeek, dayHeader[2] ?? '', dayHeader[3] ?? '');
      if (date === null) {
        const reason = '日期标题不属于目标 ISO 周';
        nodes.push({ kind: 'unknown', raw, line, reason });
        warnings.push(makeWarning(file, line, 'INVALID_DATE', reason));
        currentDate = null;
        return;
      }

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
      const node: ArchivedTaskNode = { kind: 'archivedTask', raw, line, date: currentDate, content };
      if (completedAt !== undefined) node.completedAt = completedAt;
      nodes.push(node);
      return;
    }

    const code: ParseWarning['code'] = raw.startsWith('#') ? 'INVALID_HEADER' : 'UNKNOWN_LINE';
    const reason = code === 'INVALID_HEADER' ? '无法识别的周文件标题' : '无法识别的周文件行';
    nodes.push({ kind: 'unknown', raw, line, reason });
    warnings.push(makeWarning(file, line, code, reason));
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

export const formatArchivedTask = (content: string, completedAt?: string): string =>
  `- ${content}${completedAt ? ` @${completedAt}` : ''}`;

export const serializeWeek = (document: WeekDocument): string =>
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
