import { compareLocalDates, getLocalDate } from '../../shared/dateUtils';
import type { TodayTaskView } from '../../shared/domain';
import { InvalidTodayFileError, TodayRepository } from '../repositories/todayRepository';
import { WeekRepository, type ArchivedTaskInput } from '../repositories/weekRepository';

export interface Clock {
  now(): Date;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export type ArchiveTrigger = 'startup' | 'midnight' | 'resume' | 'before-mutation';

export interface ArchiveResult {
  status: 'noop' | 'rolled-over' | 'archived';
  sourceDate: string;
  targetDate: string;
  archivedCount: number;
  carriedCount: number;
}

export class FutureTodayFileError extends Error {
  readonly code = 'INVALID_FILE' as const;

  constructor(
    readonly fileDate: string,
    readonly localToday: string,
  ) {
    super(`today.txt 日期 ${fileDate} 晚于系统本地日期 ${localToday}，已拒绝自动修改`);
    this.name = 'FutureTodayFileError';
  }
}

export class ArchivePartialFailureError extends Error {
  readonly code = 'IO_ERROR' as const;
  readonly weekWriteSucceeded = true;
  readonly duplicateRisk = true;

  constructor(
    readonly sourceDate: string,
    options: { cause: unknown },
  ) {
    super('周文件已写入，但 today.txt 更新失败；下次归档可能产生重复记录', options);
    this.name = 'ArchivePartialFailureError';
  }
}

export class ArchiveService {
  // 启动、零点、唤醒和用户操作可能同时触发补偿，必须串行读取并更新两个文件。
  private reconcileQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly todayRepository: TodayRepository,
    private readonly weekRepository: WeekRepository,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  reconcileToToday(trigger: ArchiveTrigger): Promise<ArchiveResult> {
    // trigger 供调用方记录来源；当前业务规则对所有触发源保持一致。
    void trigger;
    const execution = this.reconcileQueue
      .catch(() => undefined)
      .then(() => this.reconcileUnlocked());
    this.reconcileQueue = execution.then(
      () => undefined,
      () => undefined,
    );
    return execution;
  }

  private async reconcileUnlocked(): Promise<ArchiveResult> {
    const localToday = getLocalDate(this.clock.now());
    const read = await this.todayRepository.initialize(localToday);
    const sourceDate = read.snapshot.fileDate;
    if (!sourceDate) {
      // initialize 只创建缺失文件；格式损坏时绝不覆盖用户原文。
      throw new InvalidTodayFileError('today.txt 缺少合法日期头，无法自动归档');
    }

    const relation = compareLocalDates(sourceDate, localToday);
    const completed = read.snapshot.tasks.filter((task) => task.completed);
    const carriedCount = read.snapshot.tasks.length - completed.length;
    if (relation === 0) {
      return {
        status: 'noop',
        sourceDate,
        targetDate: localToday,
        archivedCount: 0,
        carriedCount,
      };
    }
    // 未来日期通常意味着系统时间回拨或用户手改，自动处理可能把数据归到错误周。
    if (relation === 1) throw new FutureTodayFileError(sourceDate, localToday);

    if (completed.length > 0) {
      // 顺序不可交换：必须先把完成项写入周文件，再清理 today，确保失败时数据仍可恢复。
      await this.weekRepository.appendArchivedTasks(sourceDate, completed.map(toArchivedTask));
    }

    try {
      await this.todayRepository.rollOver(read.file.revision, localToday);
    } catch (cause) {
      // 两个 TXT 无法组成原子事务，显式报告重复风险，而不是假装整个归档已回滚。
      if (completed.length > 0) throw new ArchivePartialFailureError(sourceDate, { cause });
      throw cause;
    }

    return {
      status: completed.length > 0 ? 'archived' : 'rolled-over',
      sourceDate,
      targetDate: localToday,
      archivedCount: completed.length,
      carriedCount,
    };
  }
}

/**
 * Compatibility name for platform adapters. Business code should depend on Clock.
 */
export type ArchiveClock = Clock;

const toArchivedTask = (task: TodayTaskView): ArchivedTaskInput => {
  const archived: ArchivedTaskInput = { content: task.content };
  if (task.completedAt !== undefined) archived.completedAt = task.completedAt;
  return archived;
};
