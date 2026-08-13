import { readFile } from 'node:fs/promises';
import path from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import type { DataChangedEvent } from '../../shared/domain';
import { getLocalDate, getWeekFileName } from '../../shared/dateUtils';
import { computeRevision } from '../repositories/textFileStore';
import type { TodayRepository } from '../repositories/todayRepository';
import type { AppLogger } from '../logging/logger';
import type { DataPaths } from '../platform/paths';

const WEEK_FILE_RE = /^week-(\d{4})-W(\d{2})\.txt$/;

export interface FileWatcherOptions {
  paths: DataPaths;
  todayRepository: Pick<TodayRepository, 'initialize'>;
  logger: AppLogger;
  broadcast: (event: DataChangedEvent) => void;
  debounceMs?: number;
  recentWriteWindowMs?: number;
  createWatcher?: typeof chokidar.watch;
}

export type WatchedFileEvent = 'add' | 'change' | 'unlink';

export class FileWatcherService {
  readonly #options: FileWatcherOptions;
  readonly #recentAppWrites = new Map<string, { revision: string; timestamp: number }>();
  readonly #timers = new Map<string, NodeJS.Timeout>();
  readonly #processing = new Set<Promise<void>>();
  #watcher: FSWatcher | null = null;

  constructor(options: FileWatcherOptions) {
    this.#options = options;
  }

  async start(): Promise<void> {
    if (this.#watcher) return;
    const createWatcher = this.#options.createWatcher ?? chokidar.watch;
    const watcher = createWatcher(
      [this.#options.paths.root],
      {
        depth: 2,
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
        ignored: (candidate) => this.#isIgnored(candidate),
      },
    );
    watcher.on('add', (file) => this.#enqueue(file, 'change'));
    watcher.on('change', (file) => this.#enqueue(file, 'change'));
    watcher.on('unlink', (file) => this.#enqueue(file, 'unlink'));
    watcher.on('error', (error) => this.#options.logger.error('File watcher failed', { error }));
    this.#watcher = watcher;
  }

  markAppWrite(file: string, revision: string): void {
    this.#recentAppWrites.set(path.resolve(file), { revision, timestamp: Date.now() });
  }

  markScopeWrite(scope: 'today' | 'week', revision: string): void {
    if (scope === 'today') this.markAppWrite(this.#options.paths.todayFile, revision);
  }

  async stop(): Promise<void> {
    for (const timer of this.#timers.values()) clearTimeout(timer);
    this.#timers.clear();
    await this.#watcher?.close();
    this.#watcher = null;
    await Promise.allSettled([...this.#processing]);
  }

  /** Testable adapter used by chokidar callbacks; it never accepts paths from Renderer IPC. */
  async processEventForTesting(file: string, event: WatchedFileEvent): Promise<void> {
    await this.#process(path.resolve(file), event === 'unlink' ? 'unlink' : 'change');
  }

  #enqueue(file: string, kind: 'change' | 'unlink'): void {
    const absolute = path.resolve(file);
    const previous = this.#timers.get(absolute);
    if (previous) clearTimeout(previous);
    const timer = setTimeout(() => {
      this.#timers.delete(absolute);
      const operation = this.#process(absolute, kind);
      this.#processing.add(operation);
      void operation.then(
        () => this.#processing.delete(operation),
        () => this.#processing.delete(operation),
      );
    }, this.#options.debounceMs ?? 180);
    this.#timers.set(absolute, timer);
  }

  async #process(file: string, kind: 'change' | 'unlink'): Promise<void> {
    try {
      const scope = this.#scope(file);
      if (!scope) return;

      if (kind === 'unlink' && scope.kind === 'today') {
        const recreated = await this.#options.todayRepository.initialize(getLocalDate());
        this.markAppWrite(file, recreated.file.revision);
        this.#options.logger.warn('Externally deleted today file was recreated', { file });
        this.#options.broadcast({ scope: 'today', reason: 'external-edit' });
        return;
      }

      if (kind === 'unlink') {
        this.#options.broadcast(this.#eventForScope(scope, 'external-edit'));
        return;
      }

      const revision = computeRevision(await readFile(file, 'utf8'));
      const recent = this.#recentAppWrites.get(file);
      const withinWindow = recent && Date.now() - recent.timestamp <= (this.#options.recentWriteWindowMs ?? 2_000);
      const reason = withinWindow && recent.revision === revision ? 'app-write' : 'external-edit';
      if (reason === 'app-write') this.#recentAppWrites.delete(file);
      this.#options.broadcast(this.#eventForScope(scope, reason));
    } catch (error) {
      const missing = error instanceof Error && 'code' in error && error.code === 'ENOENT';
      if (!missing) this.#options.logger.error('File watcher event could not be processed', { file, error });
    }
  }

  #scope(file: string): { kind: 'today' | 'config' | 'week'; isoYear?: number; isoWeek?: number } | null {
    if (file === path.resolve(this.#options.paths.todayFile)) return { kind: 'today' };
    if (file === path.resolve(this.#options.paths.configFile)) return { kind: 'config' };
    if (path.dirname(file) !== path.resolve(this.#options.paths.weeksDirectory)) return null;
    const match = WEEK_FILE_RE.exec(path.basename(file));
    if (!match) return null;
    return { kind: 'week', isoYear: Number(match[1]), isoWeek: Number(match[2]) };
  }

  #eventForScope(
    scope: { kind: 'today' | 'config' | 'week'; isoYear?: number; isoWeek?: number },
    reason: 'external-edit' | 'app-write',
  ): DataChangedEvent {
    if (scope.kind === 'week') {
      return { scope: 'week', isoYear: scope.isoYear, isoWeek: scope.isoWeek, reason } as DataChangedEvent;
    }
    return { scope: scope.kind, reason };
  }

  #isIgnored(candidate: string): boolean {
    const base = path.basename(candidate);
    return base.includes('.tmp') || path.resolve(candidate).startsWith(path.resolve(this.#options.paths.logsDirectory));
  }
}

export const getCurrentWeekPath = (paths: DataPaths, isoYear: number, isoWeek: number): string =>
  path.join(paths.weeksDirectory, getWeekFileName(isoYear, isoWeek));
