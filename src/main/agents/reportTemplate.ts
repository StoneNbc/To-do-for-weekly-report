import type { ReportContext, WeeklyTask } from './types';
import {
  compareLocalDates,
  formatChineseWeekday,
  getDateFromIsoWeek,
  isValidLocalDate,
} from '../../shared/dateUtils';
import { isValidLocalTime } from '../../shared/validation';

const RULE = '=======================';

export const renderTemplateReport = (
  tasks: readonly WeeklyTask[],
  context: ReportContext,
): string => {
  validateContext(context);
  const groups = groupTasks(tasks, context);
  const lines = [
    RULE,
    `周报 | ${context.isoYear}年第${context.isoWeek}周`,
    `${formatDisplayDate(context.weekStart)} - ${formatDisplayDate(context.weekEnd)}`,
    RULE,
    '',
    '【本周完成工作】',
  ];

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

  lines.push(
    '',
    '【工作总结】',
    '（此处留白，供你手动填写）',
    '',
    '【下周计划】',
    '（此处留白，供你手动填写）',
    '',
  );
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
    // Copy the public task object so the renderer cannot observe internal reordering/mutation.
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
