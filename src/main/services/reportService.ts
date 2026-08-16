import { randomUUID } from 'node:crypto';
import { open, mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import type { BrowserWindow, SaveDialogOptions, SaveDialogReturnValue } from 'electron';
import type {
  ReportAgent,
  ReportContext,
  ReportDraft,
  ReportGenerationMode,
  TodaySnapshot,
  WeeklySnapshot,
  WeeklyTask,
} from '../../shared/domain';
import type { ExportReportResult } from '../../shared/results';
import { getDateFromIsoWeek, getIsoWeekInfo, getLocalDate } from '../../shared/dateUtils';
import type { AppLogger } from '../logging/logger';
import { LlmError } from '../agents/llmErrors';

export interface WeeklyReportSource {
  getWeek(isoYear: number, isoWeek: number): Promise<WeeklySnapshot>;
}

export interface ReportAgentProvider {
  getAgent(): Promise<ReportAgent> | ReportAgent;
}

export interface PendingTaskSource {
  getToday(): Promise<TodaySnapshot>;
}

export interface SaveDialogAdapter {
  showSaveDialog(
    window: BrowserWindow | undefined,
    options: SaveDialogOptions,
  ): Promise<SaveDialogReturnValue>;
}

export interface ReportShellAdapter {
  openPath(path: string): Promise<string>;
  showItemInFolder(path: string): void;
}

export interface ReportServiceOptions {
  weeklyService: WeeklyReportSource;
  pendingTaskSource?: PendingTaskSource;
  agentProvider: ReportAgentProvider;
  dialog: SaveDialogAdapter;
  shell: ReportShellAdapter;
  logger: AppLogger;
  getDialogWindow?: () => BrowserWindow | undefined;
  isRemoteConsentConfirmed?: () => boolean;
}

export class NoExportedReportError extends Error {
  readonly code = 'NOT_FOUND' as const;

  constructor() {
    super('当前会话中还没有成功导出的周报');
    this.name = 'NoExportedReportError';
  }
}

export class ReportGenerationError extends Error {
  readonly code = 'IO_ERROR' as const;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ReportGenerationError';
  }
}

export class ReportService {
  readonly #options: ReportServiceOptions;
  #lastExportedPath: string | null = null;
  #writeQueue: Promise<void> = Promise.resolve();
  #drafts = new Map<
    string,
    {
      content: string;
      mode: ReportGenerationMode;
      createdAt: string;
      isoYear: number;
      isoWeek: number;
    }
  >();

  constructor(options: ReportServiceOptions) {
    this.#options = options;
  }

  async export(isoYear: number, isoWeek: number): Promise<ExportReportResult> {
    try {
      const draft = await this.generateDraft(isoYear, isoWeek);
      return await this.saveDraft(draft.id, draft.content);
    } catch (cause) {
      this.#options.logger.error('Report generation failed', { isoYear, isoWeek, cause });
      return {
        status: 'failed',
        message:
          cause instanceof LlmError || cause instanceof ReportGenerationError
            ? cause.message
            : '周报生成失败，请稍后重试',
      };
    }
  }

  async generateDraft(
    isoYear: number,
    isoWeek: number,
    signal?: AbortSignal,
  ): Promise<ReportDraft> {
    // 在打开系统对话框前验证，包括拒绝目标年份并不存在的 W53。
    const weekStart = getDateFromIsoWeek(isoYear, isoWeek, 1);
    const weekEnd = getDateFromIsoWeek(isoYear, isoWeek, 7);
    let snapshot: WeeklySnapshot;
    try {
      snapshot = await this.#options.weeklyService.getWeek(isoYear, isoWeek);
    } catch (cause) {
      this.#options.logger.error('Weekly report source failed', { isoYear, isoWeek, cause });
      throw new ReportGenerationError('无法读取所选周的数据，请稍后重试', { cause });
    }
    const tasks = snapshot.groups.flatMap((group) => group.tasks);
    const context: ReportContext = { isoYear, isoWeek, weekStart, weekEnd };

    let text: string;
    let mode: ReportGenerationMode;
    try {
      const agent = await this.#options.agentProvider.getAgent();
      mode = agent.name === 'openai-compatible' ? 'remote-llm' : 'local-template';
      if (!(await agent.isAvailable())) {
        throw new ReportGenerationError(`周报生成器 ${agent.name} 当前不可用`);
      }
      if (
        agent.name === 'openai-compatible' &&
        this.#options.isRemoteConsentConfirmed?.() !== true
      ) {
        throw new ReportGenerationError('请先确认远程生成的数据发送说明');
      }
      if (mode === 'remote-llm') {
        let pendingTasks: string[] = [];
        try {
          const today = await this.#options.pendingTaskSource?.getToday();
          pendingTasks =
            today?.tasks.filter((task) => !task.completed).map((task) => task.content) ?? [];
        } catch (cause) {
          this.#options.logger.warn('Pending tasks could not be added to report context', { cause });
        }
        text = await agent.generateReport(tasks as WeeklyTask[], context, {
          ...(signal ? { signal } : {}),
          pendingTasks,
        });
      } else {
        text = signal
          ? await agent.generateReport(tasks as WeeklyTask[], context, { signal })
          : await agent.generateReport(tasks as WeeklyTask[], context);
      }
    } catch (cause) {
      this.#options.logger.error('Report agent failed', { isoYear, isoWeek, cause });
      throw cause;
    }

    this.#pruneDrafts();
    const draft: ReportDraft = {
      id: randomUUID(),
      content: text,
      mode,
      createdAt: new Date().toISOString(),
    };
    this.#drafts.set(draft.id, { ...draft, isoYear, isoWeek });
    return draft;
  }

  async saveDraft(draftId: string, content: string): Promise<ExportReportResult> {
    const draft = this.#drafts.get(draftId);
    if (!draft) throw new NoExportedReportError();
    if (!content.trim() || content.length > 1_000_000) {
      throw new RangeError('周报草稿为空或内容过长');
    }

    const defaultPath = `周报-${draft.isoYear}年第${String(draft.isoWeek).padStart(2, '0')}周.txt`;
    let selection: SaveDialogReturnValue;
    try {
      selection = await this.#options.dialog.showSaveDialog(this.#options.getDialogWindow?.(), {
        title: '导出周报 TXT',
        defaultPath,
        buttonLabel: '保存',
        filters: [{ name: 'TXT 文本文件', extensions: ['txt'] }],
        properties: ['createDirectory', 'showOverwriteConfirmation'],
      });
    } catch (cause) {
      this.#options.logger.error('Report save dialog failed', {
        isoYear: draft.isoYear,
        isoWeek: draft.isoWeek,
        cause,
      });
      return { status: 'failed', message: '无法打开保存对话框，请稍后重试' };
    }
    // 用户取消属于正常流程：不写文件、不记录最近路径，也不弹错误。
    if (selection.canceled || !selection.filePath) return { status: 'cancelled' };

    const target = path.resolve(selection.filePath);
    try {
      await this.#enqueueWrite(() => writeUtf8Atomic(target, content));
      // 最近路径仅保存在本次进程内，避免持久化任意外部路径形成长期授权。
      this.#lastExportedPath = target;
      this.#drafts.delete(draftId);
      this.#options.logger.info('Weekly report exported', {
        path: target,
        isoYear: draft.isoYear,
        isoWeek: draft.isoWeek,
      });
      return { status: 'saved', path: target };
    } catch (cause) {
      this.#options.logger.error('Weekly report write failed', {
        path: target,
        isoYear: draft.isoYear,
        isoWeek: draft.isoWeek,
        cause,
      });
      return { status: 'failed', message: '周报文件保存失败，请检查所选位置后重试' };
    }
  }

  discardDraft(draftId: string): void {
    this.#drafts.delete(draftId);
  }

  async exportCurrentWeek(now: Date = new Date()): Promise<ExportReportResult> {
    const week = getIsoWeekInfo(getLocalDate(now));
    return this.export(week.isoYear, week.isoWeek);
  }

  async exportCurrentWeekFromMenu(now: Date = new Date()): Promise<void> {
    const result = await this.exportCurrentWeek(now);
    if (result.status === 'failed') {
      this.#options.logger.warn('Menu report export did not complete', { message: result.message });
    }
  }

  async openLast(): Promise<void> {
    const reportPath = this.#requireLastPath();
    const error = await this.#options.shell.openPath(reportPath);
    if (error) throw new ReportGenerationError('无法打开最近导出的周报');
  }

  revealLast(): void {
    this.#options.shell.showItemInFolder(this.#requireLastPath());
  }

  async drain(): Promise<void> {
    await this.#writeQueue;
  }

  getLastExportedPath(): string | null {
    return this.#lastExportedPath;
  }

  #requireLastPath(): string {
    if (!this.#lastExportedPath) throw new NoExportedReportError();
    return this.#lastExportedPath;
  }

  #enqueueWrite(operation: () => Promise<void>): Promise<void> {
    // 多窗口可同时发起导出；串行写入让退出 drain 能可靠等待全部任务。
    this.#writeQueue = this.#writeQueue.catch(() => undefined).then(operation);
    return this.#writeQueue;
  }

  #pruneDrafts(): void {
    const cutoff = Date.now() - 30 * 60 * 1_000;
    for (const [id, draft] of this.#drafts) {
      if (Date.parse(draft.createdAt) < cutoff) this.#drafts.delete(id);
    }
    while (this.#drafts.size >= 5) {
      const oldest = this.#drafts.keys().next().value as string | undefined;
      if (!oldest) break;
      this.#drafts.delete(oldest);
    }
  }
}

const writeUtf8Atomic = async (target: string, text: string): Promise<void> => {
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = path.join(
    path.dirname(target),
    `.${path.basename(target)}.${process.pid}.${Date.now()}.tmp`,
  );
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    // 报告同样使用同目录临时文件原子替换，失败时不会留下截断的目标文件。
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(text, 'utf8');
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, target);
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
};
