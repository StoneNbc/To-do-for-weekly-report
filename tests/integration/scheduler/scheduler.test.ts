import { EventEmitter } from 'node:events';
import type { PowerMonitor } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import type { AppLogger } from '../../../src/main/logging/logger';
import { ArchiveScheduler } from '../../../src/main/services/scheduler';

const makeLogger = (): AppLogger => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  flush: vi.fn(async () => undefined),
});

describe('ArchiveScheduler', () => {
  it('uses one reconcile path for startup, midnight, and resume', async () => {
    const reconcileToToday = vi.fn(async () => undefined);
    const powerMonitor = new EventEmitter();
    let midnightTask: (() => void) | undefined;
    const scheduledTask = { stop: vi.fn() };
    const schedule = vi.fn((_expression: string, task: () => void) => {
      midnightTask = task;
      return scheduledTask;
    });
    const scheduler = new ArchiveScheduler({
      archive: { reconcileToToday },
      powerMonitor: powerMonitor as unknown as Pick<PowerMonitor, 'on' | 'removeListener'>,
      logger: makeLogger(),
      schedule: schedule as never,
    });

    await scheduler.start();
    expect(schedule).toHaveBeenCalledWith('0 0 * * *', expect.any(Function));
    expect(reconcileToToday).toHaveBeenNthCalledWith(1, 'startup');

    midnightTask?.();
    powerMonitor.emit('resume');
    await scheduler.stop();

    expect(reconcileToToday).toHaveBeenNthCalledWith(2, 'midnight');
    expect(reconcileToToday).toHaveBeenNthCalledWith(3, 'resume');
    expect(scheduledTask.stop).toHaveBeenCalledOnce();
  });

  it('logs a reconcile failure without breaking later triggers', async () => {
    const reconcileToToday = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('failure'))
      .mockResolvedValue(undefined);
    const powerMonitor = new EventEmitter();
    const logger = makeLogger();
    const scheduler = new ArchiveScheduler({
      archive: { reconcileToToday },
      powerMonitor: powerMonitor as unknown as Pick<PowerMonitor, 'on' | 'removeListener'>,
      logger,
      schedule: (() => ({ stop: vi.fn() })) as never,
    });

    await scheduler.start();
    await scheduler.reconcile('resume');

    expect(logger.error).toHaveBeenCalledOnce();
    expect(reconcileToToday).toHaveBeenCalledTimes(2);
  });
});
