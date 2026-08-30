import { isValidLocalDate } from './dateUtils';

export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
export const MAX_TASK_CONTENT_LENGTH = 2_000;
export const MAX_TASK_DETAILS_LENGTH = 20_000;

/** 文件格式规定一项任务只能占一行，粘贴的换行会被折叠为空格。 */
export const normalizeTaskContent = (value: string): string =>
  value.replace(/[\r\n]+/g, ' ').trim();

export const isValidTaskContent = (value: string): boolean => {
  const normalized = normalizeTaskContent(value);
  return normalized.length > 0 && normalized.length <= MAX_TASK_CONTENT_LENGTH;
};

/** 校验并返回规范化后的正文，确保校验结果与最终写入内容一致。 */
export const assertValidTaskContent = (value: string): string => {
  const normalized = normalizeTaskContent(value);
  if (!normalized) throw new RangeError('任务内容不能为空');
  if (normalized.length > MAX_TASK_CONTENT_LENGTH) {
    throw new RangeError(`任务内容不能超过 ${MAX_TASK_CONTENT_LENGTH} 个字符`);
  }
  return normalized;
};

/** 详情在内存中统一使用 LF；只清理外围纯空白行，保留正文内部格式。 */
export const normalizeTaskDetails = (value: string): string => {
  const normalized = value.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  while (lines.length > 0 && !(lines[0] ?? '').trim()) lines.shift();
  while (lines.length > 0 && !(lines.at(-1) ?? '').trim()) lines.pop();
  return lines.join('\n');
};

export const assertValidTaskDetails = (value: string): string => {
  if (value.includes('\0')) throw new RangeError('任务详情不能包含 NUL 字符');
  const normalized = normalizeTaskDetails(value);
  if (normalized.length > MAX_TASK_DETAILS_LENGTH) {
    throw new RangeError(`任务详情不能超过 ${MAX_TASK_DETAILS_LENGTH} 个字符`);
  }
  return normalized;
};

export const isValidLocalTime = (value: string): boolean => TIME_PATTERN.test(value);

export const assertValidLocalTime = (value: string): string => {
  if (!isValidLocalTime(value)) throw new RangeError(`无效的本地时间：${value}`);
  return value;
};

export const assertValidIsoDate = (value: string): string => {
  if (!isValidLocalDate(value)) throw new RangeError(`无效的本地日期：${value}`);
  return value;
};
