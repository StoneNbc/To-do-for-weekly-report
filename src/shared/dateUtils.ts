/** ISO 周的年份可能与自然年不同，例如 1 月 1 日可能仍属于上一 ISO 周年。 */
export interface IsoWeekInfo {
  isoYear: number;
  isoWeek: number;
  start: string;
  end: string;
}

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const CHINESE_WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const;

const pad2 = (value: number): string => String(value).padStart(2, '0');

const formatUtcDate = (date: Date): string =>
  `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;

const parseIsoDate = (value: string): Date => {
  const match = ISO_DATE_RE.exec(value);
  if (!match) throw new RangeError(`无效的本地日期：${value}`);

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  // 领域日期没有时区和时刻。内部用 UTC 做日历运算，避免 DST 让“加一天”变成 23/25 小时。
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new RangeError(`无效的本地日期：${value}`);
  }
  return date;
};

/** 将 Date 按运行机器的本地时区格式化，作为业务上的“今天”。 */
export const getLocalDate = (now: Date = new Date()): string =>
  `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;

export const isValidLocalDate = (value: string): boolean => {
  try {
    parseIsoDate(value);
    return true;
  } catch {
    return false;
  }
};

export const compareLocalDates = (a: string, b: string): -1 | 0 | 1 => {
  const left = parseIsoDate(a).getTime();
  const right = parseIsoDate(b).getTime();
  return left === right ? 0 : left < right ? -1 : 1;
};

export const addLocalDays = (value: string, days: number): string => {
  if (!Number.isInteger(days)) throw new RangeError('日期偏移必须是整数');
  return formatUtcDate(new Date(parseIsoDate(value).getTime() + days * DAY_MS));
};

export const getIsoWeekInfo = (value: string): IsoWeekInfo => {
  const date = parseIsoDate(value);
  const isoWeekday = date.getUTCDay() || 7;
  const monday = new Date(date.getTime() - (isoWeekday - 1) * DAY_MS);
  // ISO 周年由该周的周四决定，因此跨年周不能直接使用日期的自然年。
  const thursday = new Date(monday.getTime() + 3 * DAY_MS);
  const isoYear = thursday.getUTCFullYear();

  const januaryFourth = new Date(Date.UTC(isoYear, 0, 4));
  const januaryFourthWeekday = januaryFourth.getUTCDay() || 7;
  const firstMonday = new Date(januaryFourth.getTime() - (januaryFourthWeekday - 1) * DAY_MS);
  const isoWeek = Math.floor((monday.getTime() - firstMonday.getTime()) / (7 * DAY_MS)) + 1;

  return {
    isoYear,
    isoWeek,
    start: formatUtcDate(monday),
    end: formatUtcDate(new Date(monday.getTime() + 6 * DAY_MS)),
  };
};

export const getDateFromIsoWeek = (
  isoYear: number,
  isoWeek: number,
  isoWeekday: number,
): string => {
  if (!Number.isInteger(isoYear) || isoYear < 1 || isoYear > 9999) {
    throw new RangeError('ISO 周年必须是 1 至 9999 的整数');
  }
  if (!Number.isInteger(isoWeek) || isoWeek < 1 || isoWeek > 53) {
    throw new RangeError('ISO 周数必须是 1 至 53 的整数');
  }
  if (!Number.isInteger(isoWeekday) || isoWeekday < 1 || isoWeekday > 7) {
    throw new RangeError('ISO 星期必须是 1 至 7 的整数');
  }

  const januaryFourth = new Date(Date.UTC(isoYear, 0, 4));
  const januaryFourthWeekday = januaryFourth.getUTCDay() || 7;
  const firstMonday = new Date(januaryFourth.getTime() - (januaryFourthWeekday - 1) * DAY_MS);
  const result = new Date(firstMonday.getTime() + ((isoWeek - 1) * 7 + isoWeekday - 1) * DAY_MS);
  const formatted = formatUtcDate(result);
  // 回算一次可以拒绝并非每年都存在的 W53。
  const actual = getIsoWeekInfo(formatted);
  if (actual.isoYear !== isoYear || actual.isoWeek !== isoWeek) {
    throw new RangeError(`${isoYear}-W${pad2(isoWeek)} 不存在`);
  }
  return formatted;
};

export const getWeekFileName = (isoYear: number, isoWeek: number): string => {
  getDateFromIsoWeek(isoYear, isoWeek, 1);
  return `week-${isoYear}-W${pad2(isoWeek)}.txt`;
};

export const formatChineseWeekday = (value: string): string => {
  const weekday = CHINESE_WEEKDAYS[parseIsoDate(value).getUTCDay()];
  if (!weekday) throw new RangeError(`无效的本地日期：${value}`);
  return weekday;
};

export const formatMonthDay = (value: string, separator = '-'): string => {
  parseIsoDate(value);
  return `${value.slice(5, 7)}${separator}${value.slice(8, 10)}`;
};
