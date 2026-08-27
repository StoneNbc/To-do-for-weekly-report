import type {
  DayRecordSnapshot,
  HistoryViewSnapshot,
  HistoricalTaskView,
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
import { TaskLineNotFoundError } from '../repositories/todayRepository';
import { FileChangedError } from '../repositories/textFileStore';
import { WeekRepository } from '../repositories/weekRepository';
import { ArchiveService, SystemClock, type Clock } from './archiveService';
import type { AppLogger } from '../logging/logger';

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

export interface AddPendingFromHistoryInput {
  date: string;
  content: string;
}

export interface CompletePendingOnDateInput {
  date: string;
  locator: TaskLocator;
}

export interface EditPendingFromHistoryInput extends CompletePendingOnDateInput {
  content: string;
}

export type ReopenHistoricalTaskInput = DeleteHistoricalTaskInput;

export class FutureHistoricalDateError extends Error {
  readonly code = 'INVALID_INPUT' as const;

  constructor(readonly date: string) {
    super(`不能通过历史模式操作今天或未来日期：${date}`);
    this.name = 'FutureHistoricalDateError';
  }
}

export class CompletionBeforeAddedDateError extends Error {
  readonly code = 'INVALID_INPUT' as const;

  constructor(
    readonly completedDate: string,
    readonly addedDate: string,
  ) {
    super(`完成日期 ${completedDate} 不能早于添加日期 ${addedDate}`);
    this.name = 'CompletionBeforeAddedDateError';
  }
}

export class HistoryTransferPartialFailureError extends Error {
  readonly code = 'IO_ERROR' as const;

  constructor(message: string, options: { cause: unknown }) {
    super(message, options);
    this.name = 'HistoryTransferPartialFailureError';
  }
}

export class WeeklyService {
  private transferQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly weekRepository: WeekRepository,
    private readonly todayRepository: TodayRepository,
    private readonly clock: Clock = new SystemClock(),
    private readonly archiveService?: Pick<ArchiveService, 'reconcileToToday'>,
    private readonly logger?: Pick<AppLogger, 'error'>,
  ) {}

  async getDay(date: string): Promise<DayRecordSnapshot> {
    this.assertHistoricalDate(date);
    return this.weekRepository.getDay(date);
  }

  async getHistoryView(date: string): Promise<HistoryViewSnapshot> {
    this.assertHistoricalDate(date);
    const localToday = getLocalDate(this.clock.now());
    const [today, completed] = await Promise.all([
      this.todayRepository.initialize(localToday),
      this.weekRepository.getDay(date),
    ]);
    return {
      date,
      backlog: {
        ...today.snapshot,
        tasks: today.snapshot.tasks.filter(
          (task) =>
            !task.completed &&
            (task.addedDate === undefined || compareLocalDates(task.addedDate, date) <= 0),
        ),
      },
      completed,
    };
  }

  async addPendingFromHistory(input: AddPendingFromHistoryInput): Promise<HistoryViewSnapshot> {
    this.assertHistoricalDate(input.date);
    await this.archiveService?.reconcileToToday('before-mutation');
    await this.todayRepository.addTask(input.content, null, input.date);
    return this.getHistoryView(input.date);
  }

  async editPendingFromHistory(input: EditPendingFromHistoryInput): Promise<HistoryViewSnapshot> {
    this.assertHistoricalDate(input.date);
    await this.archiveService?.reconcileToToday('before-mutation');
    await this.todayRepository.updateTask(input.locator, { content: input.content });
    return this.getHistoryView(input.date);
  }

  async deletePendingFromHistory(
    input: CompletePendingOnDateInput,
  ): Promise<HistoryViewSnapshot> {
    this.assertHistoricalDate(input.date);
    await this.archiveService?.reconcileToToday('before-mutation');
    await this.todayRepository.deleteTask(input.locator);
    return this.getHistoryView(input.date);
  }

  completePendingOnDate(input: CompletePendingOnDateInput): Promise<HistoryViewSnapshot> {
    return this.enqueueTransfer(() => this.completePendingOnDateUnlocked(input));
  }

  reopenHistoricalTask(input: ReopenHistoricalTaskInput): Promise<HistoryViewSnapshot> {
    return this.enqueueTransfer(() => this.reopenHistoricalTaskUnlocked(input));
  }

  async addHistoricalTask(input: AddHistoricalTaskInput): Promise<DayRecordSnapshot> {
    this.assertHistoricalDate(input.date);
    const task: { content: string; completedAt?: string } = { content: input.content };
    if (input.completedAt !== undefined) task.completedAt = input.completedAt;
    return this.weekRepository.addHistoricalTask(input.date, task);
  }

  async editHistoricalTask(input: EditHistoricalTaskInput): Promise<HistoryViewSnapshot> {
    this.assertHistoricalDate(input.date);
    const task: { content: string; completedAt?: string } = { content: input.content };
    if (input.completedAt !== undefined) task.completedAt = input.completedAt;
    await this.weekRepository.updateHistoricalTask(input.date, input.locator, task);
    return this.getHistoryView(input.date);
  }

  async deleteHistoricalTask(input: DeleteHistoricalTaskInput): Promise<HistoryViewSnapshot> {
    this.assertHistoricalDate(input.date);
    await this.weekRepository.deleteHistoricalTask(input.date, input.locator);
    return this.getHistoryView(input.date);
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

  private enqueueTransfer(operation: () => Promise<HistoryViewSnapshot>): Promise<HistoryViewSnapshot> {
    const execution = this.transferQueue.catch(() => undefined).then(operation);
    this.transferQueue = execution.then(
      () => undefined,
      () => undefined,
    );
    return execution;
  }

  private async completePendingOnDateUnlocked(
    input: CompletePendingOnDateInput,
  ): Promise<HistoryViewSnapshot> {
    this.assertHistoricalDate(input.date);
    await this.archiveService?.reconcileToToday('before-mutation');
    const today = await this.todayRepository.read();
    if (today.file.revision !== input.locator.revision) {
      throw new FileChangedError(this.todayRepository.path);
    }
    const task = today.snapshot.tasks.find(
      (candidate) => candidate.locator.line === input.locator.line,
    );
    if (!task || task.completed) throw new TaskLineNotFoundError(input.locator.line);
    if (task.addedDate !== undefined && compareLocalDates(input.date, task.addedDate) < 0) {
      throw new CompletionBeforeAddedDateError(input.date, task.addedDate);
    }

    const inserted = await this.weekRepository.insertHistoricalTask(input.date, {
      content: task.content,
      ...(task.addedDate !== undefined ? { addedDate: task.addedDate } : {}),
    });
    try {
      await this.todayRepository.deleteTask(input.locator);
    } catch (cause) {
      try {
        await this.weekRepository.deleteHistoricalTask(input.date, inserted.insertedLocator);
      } catch (rollbackError) {
        this.logger?.error('Historical completion rollback failed', { cause, rollbackError });
        throw new HistoryTransferPartialFailureError(
          '历史完成记录已写入，但待办移除和自动回滚失败；数据可能重复，请刷新检查',
          { cause },
        );
      }
      throw cause;
    }
    return this.getHistoryView(input.date);
  }

  private async reopenHistoricalTaskUnlocked(
    input: ReopenHistoricalTaskInput,
  ): Promise<HistoryViewSnapshot> {
    this.assertHistoricalDate(input.date);
    await this.archiveService?.reconcileToToday('before-mutation');
    const day = await this.weekRepository.getDay(input.date);
    if (day.revision !== input.locator.revision) {
      const week = getIsoWeekInfo(input.date);
      throw new FileChangedError(this.weekRepository.getPath(week.isoYear, week.isoWeek));
    }
    const task: HistoricalTaskView | undefined = day.tasks.find(
      (candidate) => candidate.locator.line === input.locator.line,
    );
    if (!task) throw new TaskLineNotFoundError(input.locator.line);

    const inserted = await this.todayRepository.addTask(
      task.content,
      null,
      task.addedDate,
    );
    try {
      await this.weekRepository.deleteHistoricalTask(input.date, input.locator);
    } catch (cause) {
      try {
        await this.todayRepository.deleteTask(inserted.insertedLocator);
      } catch (rollbackError) {
        this.logger?.error('Historical reopen rollback failed', { cause, rollbackError });
        throw new HistoryTransferPartialFailureError(
          '待办已恢复，但历史记录移除和自动回滚失败；数据可能重复，请刷新检查',
          { cause },
        );
      }
      throw cause;
    }
    return this.getHistoryView(input.date);
  }
}
