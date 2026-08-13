import { isValidLocalDate } from './dateUtils';

export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
export const MAX_TASK_CONTENT_LENGTH = 2_000;

export const normalizeTaskContent = (value: string): string =>
  value.replace(/[\r\n]+/g, ' ').trim();

export const isValidTaskContent = (value: string): boolean => {
  const normalized = normalizeTaskContent(value);
  return normalized.length > 0 && normalized.length <= MAX_TASK_CONTENT_LENGTH;
};

export const assertValidTaskContent = (value: string): string => {
  const normalized = normalizeTaskContent(value);
  if (!normalized) throw new RangeError('任务内容不能为空');
  if (normalized.length > MAX_TASK_CONTENT_LENGTH) {
    throw new RangeError(`任务内容不能超过 ${MAX_TASK_CONTENT_LENGTH} 个字符`);
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
