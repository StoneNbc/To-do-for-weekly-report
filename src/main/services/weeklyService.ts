import type {
  DayRecordSnapshot,
  TaskLocator,
  WeeklySnapshot,
  WeeklyTask,
} from '../../shared/domain';
import {
  compareLocalDates,
  formatChineseWeekday,
  getIsoWeekInfo,
  getLocalDate,
} from '../../shared/dateUtils';
import { assertValidIsoDate } from '../../shared/validation';
import { TodayRepository } from '../repositories/todayRepository';
import { WeekRepository } from '../repositories/weekRepository';
import { SystemClock, type Clock } from './archiveService';

export interface AddHistoricalTaskInput {
  date: string;
  content: string;
  completedAt?: string | undefined;
}

export interface EditHistoricalTaskInput extends AddHistoricalTaskInput {
  locator: TaskLocator;
}

export interface DeleteHistoricalTaskInput {
  date: string;
  locator: TaskLocator;
}

export class FutureHistoricalDateError extends Error {
  readonly code = 'INVALID_INPUT' as const;

  constructor(readonly date: string) {
    super(`不能通过历史模式操作今天或未来日期：${date}`);
    this.name = 'FutureHistoricalDateError';
  }
}

export class WeeklyService {
  constructor(
    private readonly weekRepository: WeekRepository,
    private readonly todayRepository: TodayRepository,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  async getDay(date: string): Promise<DayRecordSnapshot> {
    this.assertHistoricalDate(date);
    return this.weekRepository.getDay(date);
  }

  async addHistoricalTask(input: AddHistoricalTaskInput): Promise<DayRecordSnapshot> {
    this.assertHistoricalDate(input.date);
    const task: { content: string; completedAt?: string } = { content: input.content };
    if (input.completedAt !== undefined) task.completedAt = input.completedAt;
    return this.weekRepository.addHistoricalTask(input.date, task);
  }

  async editHistoricalTask(input: EditHistoricalTaskInput): Promise<DayRecordSnapshot> {
    this.assertHistoricalDate(input.date);
    const task: { content: string; completedAt?: string } = { content: input.content };
    if (input.completedAt !== undefined) task.completedAt = input.completedAt;
    return this.weekRepository.updateHistoricalTask(input.date, input.locator, task);
  }

  async deleteHistoricalTask(input: DeleteHistoricalTaskInput): Promise<DayRecordSnapshot> {
    this.assertHistoricalDate(input.date);
    return this.weekRepository.deleteHistoricalTask(input.date, input.locator);
  }

  async getWeek(isoYear: number, isoWeek: number): Promise<WeeklySnapshot> {
    const archived = await this.weekRepository.getWeekSnapshot(isoYear, isoWeek);
    const localToday = getLocalDate(this.clock.now());
    const currentWeek = getIsoWeekInfo(localToday);
    // 只有当前周需要实时合并 today；历史周完全以归档文件为准。
    if (currentWeek.isoYear !== isoYear || currentWeek.isoWeek !== isoWeek) return archived;

    const today = await this.todayRepository.initialize(localToday);
    if (today.snapshot.fileDate !== localToday) return archived;
    const completed = today.snapshot.tasks.filter((task) => task.completed);
    if (completed.length === 0) return archived;

    // 克隆后再合并，避免修改 Repository 返回的快照对象。
    const groups = archived.groups.map((group) => ({ ...group, tasks: [...group.tasks] }));
    let todayGroup = groups.find((group) => group.date === localToday);
    if (!todayGroup) {
      todayGroup = { date: localToday, weekdayLabel: formatChineseWeekday(localToday), tasks: [] };
      groups.push(todayGroup);
      groups.sort((a, b) => compareLocalDates(a.date, b.date));
    }
    for (const task of completed) {
      const weeklyTask: WeeklyTask = { date: localToday, content: task.content };
      if (task.completedAt !== undefined) weeklyTask.time = task.completedAt;
      // today 中的完成项尚未归档，因此不会与周文件做正文去重。
      todayGroup.tasks.push(weeklyTask);
    }
    return {
      ...archived,
      groups,
      total: archived.total + completed.length,
    };
  }

  private assertHistoricalDate(date: string): void {
    assertValidIsoDate(date);
    // 今天由今日视图维护；历史模式只允许补录过去，避免两个事实来源同时写当天。
    if (compareLocalDates(date, getLocalDate(this.clock.now())) >= 0) {
      throw new FutureHistoricalDateError(date);
    }
  }
}
