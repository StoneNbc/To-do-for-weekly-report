import type { TaskLocator, TodaySnapshot } from '../../shared/domain';
import { getLocalDate } from '../../shared/dateUtils';
import { TaskLineNotFoundError, TodayRepository } from '../repositories/todayRepository';
import { FileChangedError } from '../repositories/textFileStore';
import { ArchiveService, SystemClock, type Clock } from './archiveService';

export class TaskService {
  constructor(
    private readonly todayRepository: TodayRepository,
    private readonly archiveService: ArchiveService,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  async getToday(): Promise<TodaySnapshot> {
    const localDate = getLocalDate(this.clock.now());
    return (await this.todayRepository.initialize(localDate)).snapshot;
  }

  async addTodayTask(content: string): Promise<TodaySnapshot> {
    await this.archiveService.reconcileToToday('before-mutation');
    return (await this.todayRepository.addTask(content)).snapshot;
  }

  async toggleTodayTask(locator: TaskLocator): Promise<TodaySnapshot> {
    await this.archiveService.reconcileToToday('before-mutation');
    const current = await this.todayRepository.read();
    if (current.file.revision !== locator.revision) {
      throw new FileChangedError(this.todayRepository.path);
    }
    const task = current.snapshot.tasks.find((candidate) => candidate.locator.line === locator.line);
    if (!task) throw new TaskLineNotFoundError(locator.line);
    const completed = !task.completed;
    return (
      await this.todayRepository.updateTask(locator, {
        completed,
        completedAt: completed ? formatLocalTime(this.clock.now()) : null,
      })
    ).snapshot;
  }

  async editTodayTask(
    locator: TaskLocator,
    content: string,
    completedAt?: string,
  ): Promise<TodaySnapshot> {
    await this.archiveService.reconcileToToday('before-mutation');
    const changes: { content: string; completedAt?: string } = { content };
    if (completedAt !== undefined) changes.completedAt = completedAt;
    return (await this.todayRepository.updateTask(locator, changes)).snapshot;
  }

  async deleteTodayTask(locator: TaskLocator): Promise<TodaySnapshot> {
    await this.archiveService.reconcileToToday('before-mutation');
    return (await this.todayRepository.deleteTask(locator)).snapshot;
  }
}

const formatLocalTime = (date: Date): string =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
