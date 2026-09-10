import type { MoveTasksInput } from '../../shared/projects';
import type { TaskLocator, TodaySnapshot } from '../../shared/domain';
import { getLocalDate } from '../../shared/dateUtils';
import { TaskLineNotFoundError, TodayRepository } from '../repositories/todayRepository';
import { FileChangedError } from '../repositories/textFileStore';
import { ArchiveService, SystemClock, type Clock } from './archiveService';

/**
 * 今日任务业务服务：查询、新增、完成/撤销、编辑、删除。
 * 每次写操作前先补偿跨日（reconcileToToday），确保新任务写入正确的 today.txt；
 * 完成时间��� Main 的 Clock 产生，Renderer 不提供可信时钟。
 */
export class TaskService {
  constructor(
    private readonly todayRepository: TodayRepository,
    private readonly archiveService: ArchiveService,
    private readonly clock: Clock = new SystemClock(),
    private readonly assertProject: (name: string | null | undefined) => Promise<void> = async () =>
      undefined,
  ) {}

  async getToday(): Promise<TodaySnapshot> {
    const localDate = getLocalDate(this.clock.now());
    return (await this.todayRepository.initialize(localDate)).snapshot;
  }

  async addTodayTask(content: string, projectName: string | null = null): Promise<TodaySnapshot> {
    await this.assertProject(projectName);
    // 每次写入前补偿跨日，防止新任务被写入昨天的 today.txt。
    await this.archiveService.reconcileToToday('before-mutation');
    return (
      await this.todayRepository.addTask(
        content,
        null,
        getLocalDate(this.clock.now()),
        '',
        projectName,
      )
    ).snapshot;
  }

  async toggleTodayTask(locator: TaskLocator): Promise<TodaySnapshot> {
    await this.archiveService.reconcileToToday('before-mutation');
    const current = await this.todayRepository.read();
    // 先检查整文件 revision，再按行读取真实状态，避免基于过期 UI 反向切换。
    if (current.file.revision !== locator.revision) {
      throw new FileChangedError(this.todayRepository.path);
    }
    const task = current.snapshot.tasks.find(
      (candidate) => candidate.locator.line === locator.line,
    );
    if (!task) throw new TaskLineNotFoundError(locator.line);
    if (task.completed) await this.assertProject(task.projectName);
    const completed = !task.completed;
    return (
      await this.todayRepository.updateTask(locator, {
        completed,
        // 完成时间由 Main 的 Clock 产生；撤销时明确清除，Renderer 不提供可信时钟。
        completedAt: completed ? formatLocalTime(this.clock.now()) : null,
      })
    ).snapshot;
  }

  async editTodayTask(
    locator: TaskLocator,
    content: string,
    details: string,
    completedAt?: string,
    projectName?: string | null,
  ): Promise<TodaySnapshot> {
    await this.archiveService.reconcileToToday('before-mutation');
    if (projectName !== undefined) await this.assertProject(projectName);
    const changes: {
      content: string;
      details: string;
      completedAt?: string;
      projectName?: string | null;
    } = {
      content,
      details,
    };
    if (completedAt !== undefined) changes.completedAt = completedAt;
    if (projectName !== undefined) changes.projectName = projectName;
    return (await this.todayRepository.updateTask(locator, changes)).snapshot;
  }

  async moveMany(input: MoveTasksInput): Promise<TodaySnapshot> {
    await this.assertProject(input.projectName);
    await this.archiveService.reconcileToToday('before-mutation');
    return this.todayRepository.moveMany(input);
  }

  async deleteTodayTask(locator: TaskLocator): Promise<TodaySnapshot> {
    await this.archiveService.reconcileToToday('before-mutation');
    return (await this.todayRepository.deleteTask(locator)).snapshot;
  }
}

const formatLocalTime = (date: Date): string =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
