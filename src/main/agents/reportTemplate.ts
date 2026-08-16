import type { ReportContext, WeeklyTask } from './types';
import {
  compareLocalDates,
  formatChineseWeekday,
  getDateFromIsoWeek,
  isValidLocalDate,
} from '../../shared/dateUtils';
import { isValidLocalTime } from '../../shared/validation';
import { DEFAULT_REPORT_TEMPLATE } from '../../shared/constants';

const SUPPORTED_VARIABLES = new Set(['iso_year', 'iso_week', 'week_start', 'week_end', 'tasks']);
const TEMPLATE_VARIABLE = /\{\{([a-z_]+)\}\}/g;
export const MAX_REPORT_TEMPLATE_LENGTH = 20_000;
export const MAX_REPORT_PROMPT_LENGTH = 20_000;

export const renderTemplateReport = (
  tasks: readonly WeeklyTask[],
  context: ReportContext,
  template = DEFAULT_REPORT_TEMPLATE,
): string => {
  validateContext(context);
  validateReportTemplate(template);
  const taskText = renderTaskList(tasks, context);
  const values: Record<string, string> = {
    iso_year: String(context.isoYear),
    iso_week: String(context.isoWeek),
    week_start: formatDisplayDate(context.weekStart),
    week_end: formatDisplayDate(context.weekEnd),
    tasks: taskText,
  };

  // 单次替换保证任务正文里的 {{...}} 只被当作普通文本，不能触发二次解析。
  return template.replace(TEMPLATE_VARIABLE, (_match, name: string) => values[name] ?? '');
};

export const validateReportTemplate = (template: string): void => {
  if (!template.trim()) throw new RangeError('周报模板不能为空');
  if (template.length > MAX_REPORT_TEMPLATE_LENGTH) {
    throw new RangeError(`周报模板不能超过 ${MAX_REPORT_TEMPLATE_LENGTH} 个字符`);
  }
  if (!template.includes('{{tasks}}')) throw new RangeError('周报模板必须包含 {{tasks}}');

  for (const match of template.matchAll(TEMPLATE_VARIABLE)) {
    const name = match[1];
    if (name && !SUPPORTED_VARIABLES.has(name)) {
      throw new RangeError(`周报模板包含未知变量：{{${name}}}`);
    }
  }

  const withoutRecognizedTokens = template.replace(TEMPLATE_VARIABLE, '');
  if (/\{\{|\}\}/.test(withoutRecognizedTokens)) {
    throw new RangeError('周报模板包含格式无效或不完整的变量');
  }
};

export const validateReportPrompt = (prompt: string): void => {
  if (!prompt.trim()) throw new RangeError('远程周报提示词不能为空');
  if (prompt.length > MAX_REPORT_PROMPT_LENGTH) {
    throw new RangeError(`远程周报提示词不能超过 ${MAX_REPORT_PROMPT_LENGTH} 个字符`);
  }
};

export const renderTaskList = (tasks: readonly WeeklyTask[], context: ReportContext): string => {
  const groups = groupTasks(tasks, context);
  const lines: string[] = [];

  if (groups.length === 0) {
    lines.push('（本周暂无已记录的完成事项）');
  } else {
    groups.forEach((group, index) => {
      if (index > 0) lines.push('');
      lines.push(`■ ${formatChineseWeekday(group.date)} ${group.date.slice(5).replace('-', '.')}`);
      for (const task of group.tasks) {
        lines.push(`- ${task.content}${task.time ? ` @${task.time}` : ''}`);
      }
    });
  }
  return lines.join('\n');
};

interface TaskGroup {
  date: string;
  tasks: WeeklyTask[];
}

const groupTasks = (tasks: readonly WeeklyTask[], context: ReportContext): TaskGroup[] => {
  const indexed = tasks.map((task, index) => ({ task, index }));
  indexed.sort((left, right) => {
    const dateOrder = compareLocalDates(left.task.date, right.task.date);
    return dateOrder === 0 ? left.index - right.index : dateOrder;
  });

  const groups: TaskGroup[] = [];
  for (const { task } of indexed) {
    validateTask(task, context);
    let group = groups.at(-1);
    if (!group || group.date !== task.date) {
      group = { date: task.date, tasks: [] };
      groups.push(group);
    }
    // 复制公开任务对象，调用方不会观察到内部排序或后续修改。
    const copied: WeeklyTask = { date: task.date, content: task.content };
    if (task.time !== undefined) copied.time = task.time;
    group.tasks.push(copied);
  }
  return groups;
};

const validateContext = (context: ReportContext): void => {
  if (!Number.isInteger(context.isoYear) || !Number.isInteger(context.isoWeek)) {
    throw new RangeError('周报上下文中的 ISO 年和周数无效');
  }
  if (!isValidLocalDate(context.weekStart) || !isValidLocalDate(context.weekEnd)) {
    throw new RangeError('周报上下文中的周范围无效');
  }
  const expectedStart = getDateFromIsoWeek(context.isoYear, context.isoWeek, 1);
  const expectedEnd = getDateFromIsoWeek(context.isoYear, context.isoWeek, 7);
  if (context.weekStart !== expectedStart || context.weekEnd !== expectedEnd) {
    throw new RangeError('周报上下文范围必须是目标 ISO 周的周一至周日');
  }
};

const validateTask = (task: WeeklyTask, context: ReportContext): void => {
  if (!isValidLocalDate(task.date)) throw new RangeError(`周报任务日期无效：${task.date}`);
  if (
    compareLocalDates(task.date, context.weekStart) === -1 ||
    compareLocalDates(task.date, context.weekEnd) === 1
  ) {
    throw new RangeError(`周报任务日期不在所选周范围内：${task.date}`);
  }
  if (!task.content.trim() || /[\r\n]/.test(task.content)) {
    throw new RangeError('周报任务正文不能为空或包含换行');
  }
  if (task.time !== undefined && !isValidLocalTime(task.time)) {
    throw new RangeError(`周报任务完成时间无效：${task.time}`);
  }
};

const formatDisplayDate = (date: string): string => date.replaceAll('-', '.');
