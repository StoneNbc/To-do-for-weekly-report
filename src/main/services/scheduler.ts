import cron, { type ScheduledTask } from 'node-cron';
import type { PowerMonitor } from 'electron';
import type { AppLogger } from '../logging/logger';

export type SchedulerTrigger = 'startup' | 'scheduled' | 'resume';
export type ArchiveTrigger = 'startup' | 'midnight' | 'resume';

export interface ArchiveReconciler {
  reconcileToToday(trigger: ArchiveTrigger): Promise<unknown>;
}

export interface SchedulerOptions {
  archive: ArchiveReconciler;
  powerMonitor: Pick<PowerMonitor, 'on' | 'removeListener'>;
  logger: AppLogger;
  schedule?: (expression: string, task: () => void, options?: { timezone?: string }) => ScheduledTask;
}

export class ArchiveScheduler {
  readonly #archive: ArchiveReconciler;
  readonly #powerMonitor: Pick<PowerMonitor, 'on' | 'removeListener'>;
  readonly #logger: AppLogger;
  readonly #schedule: NonNullable<SchedulerOptions['schedule']>;
  #cronTask: ScheduledTask | null = null;
  #queue: Promise<void> = Promise.resolve();

  constructor({ archive, powerMonitor, logger, schedule = cron.schedule }: SchedulerOptions) {
    this.#archive = archive;
    this.#powerMonitor = powerMonitor;
    this.#logger = logger;
    this.#schedule = schedule;
  }

  async start(): Promise<void> {
    await this.reconcile('startup');
    this.#cronTask = this.#schedule('0 0 * * *', () => {
      void this.reconcile('scheduled');
    });
    this.#powerMonitor.on('resume', this.#handleResume);
  }

  async stop(): Promise<void> {
    this.#cronTask?.stop();
    this.#cronTask = null;
    this.#powerMonitor.removeListener('resume', this.#handleResume);
    await this.#queue;
  }

  reconcile(trigger: SchedulerTrigger): Promise<void> {
    this.#queue = this.#queue.then(async () => {
      try {
        await this.#archive.reconcileToToday(trigger === 'scheduled' ? 'midnight' : trigger);
        this.#logger.info('Archive reconciliation completed', { trigger });
      } catch (error) {
        this.#logger.error('Archive reconciliation failed', { trigger, error });
      }
    });
    return this.#queue;
  }

  readonly #handleResume = (): void => {
    void this.reconcile('resume');
  };
}
