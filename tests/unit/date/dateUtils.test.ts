import { describe, expect, it } from 'vitest';
import {
  addLocalDays,
  compareLocalDates,
  formatChineseWeekday,
  getDateFromIsoWeek,
  getIsoWeekInfo,
  getLocalDate,
  getWeekFileName,
  isValidLocalDate,
} from '../../../src/shared/dateUtils';

describe('dateUtils', () => {
  it('uses the Date local calendar rather than UTC for today', () => {
    const value = new Date(2026, 7, 13, 0, 1);
    expect(getLocalDate(value)).toBe('2026-08-13');
  });

  it('calculates a normal ISO week including the weekend', () => {
    expect(getIsoWeekInfo('2026-08-13')).toEqual({
      isoYear: 2026,
      isoWeek: 33,
      start: '2026-08-10',
      end: '2026-08-16',
    });
    expect(getIsoWeekInfo('2026-08-16').isoWeek).toBe(33);
  });

  it('uses the ISO week-year across natural year boundaries', () => {
    expect(getIsoWeekInfo('2018-12-31')).toEqual({
      isoYear: 2019,
      isoWeek: 1,
      start: '2018-12-31',
      end: '2019-01-06',
    });
    expect(getIsoWeekInfo('2021-01-01')).toEqual({
      isoYear: 2020,
      isoWeek: 53,
      start: '2020-12-28',
      end: '2021-01-03',
    });
    expect(getWeekFileName(2020, 3)).toBe('week-2020-W03.txt');
  });

  it('validates leap dates and rejects impossible dates/weeks', () => {
    expect(isValidLocalDate('2024-02-29')).toBe(true);
    expect(isValidLocalDate('2023-02-29')).toBe(false);
    expect(() => getDateFromIsoWeek(2021, 53, 1)).toThrow(RangeError);
  });

  it('compares and moves calendar dates without local DST ambiguity', () => {
    expect(addLocalDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(compareLocalDates('2026-08-12', '2026-08-13')).toBe(-1);
    expect(formatChineseWeekday('2026-08-13')).toBe('周四');
  });
});
