import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppLogger } from '../../../src/main/logging/logger';
import { resolveDataPaths } from '../../../src/main/platform/paths';
import { computeRevision } from '../../../src/main/repositories/textFileStore';
import { FileWatcherService } from '../../../src/main/services/fileWatcher';

const roots: string[] = [];

const makeLogger = (): AppLogger => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  flush: vi.fn(async () => undefined),
});

const setup = async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sticky-watcher-'));
  roots.push(root);
  const paths = resolveDataPaths({
    app: { isPackaged: false, getPath: () => root },
    cwd: root,
    environment: { NODE_ENV: 'test', STICKY_WEEKLY_DATA_DIR: root },
  });
  await mkdir(paths.weeksDirectory, { recursive: true });
  const broadcast = vi.fn();
  const initialize = vi.fn(async () => ({ file: { revision: 'recreated' } }));
  const watcher = new FileWatcherService({
    paths,
    todayRepository: { initialize } as never,
    logger: makeLogger(),
    broadcast,
  });
  return { paths, watcher, broadcast, initialize };
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('FileWatcherService', () => {
  it('classifies an external today edit and broadcasts no task body', async () => {
    const { paths, watcher, broadcast } = await setup();
    await writeFile(paths.todayFile, '# 2026-08-13\n- [ ] private task\n', 'utf8');

    await watcher.processEventForTesting(paths.todayFile, 'change');

    expect(broadcast).toHaveBeenCalledWith({ scope: 'today', reason: 'external-edit' });
    expect(JSON.stringify(broadcast.mock.calls)).not.toContain('private task');
  });

  it('recognizes the recent revision of an application write once', async () => {
    const { paths, watcher, broadcast } = await setup();
    const text = '# 2026-08-13\n';
    await writeFile(paths.todayFile, text, 'utf8');
    watcher.markAppWrite(paths.todayFile, computeRevision(text));

    await watcher.processEventForTesting(paths.todayFile, 'change');
    await watcher.processEventForTesting(paths.todayFile, 'change');

    expect(broadcast).toHaveBeenNthCalledWith(1, { scope: 'today', reason: 'app-write' });
    expect(broadcast).toHaveBeenNthCalledWith(2, { scope: 'today', reason: 'external-edit' });
  });

  it('recreates an externally deleted today file and emits one refresh', async () => {
    const { paths, watcher, broadcast, initialize } = await setup();

    await watcher.processEventForTesting(paths.todayFile, 'unlink');

    expect(initialize).toHaveBeenCalledOnce();
    expect(broadcast).toHaveBeenCalledOnce();
    expect(broadcast).toHaveBeenCalledWith({ scope: 'today', reason: 'external-edit' });
  });

  it('treats a deleted week as an empty source and emits its ISO coordinates', async () => {
    const { paths, watcher, broadcast, initialize } = await setup();
    const weekFile = path.join(paths.weeksDirectory, 'week-2026-W33.txt');

    await watcher.processEventForTesting(weekFile, 'unlink');

    expect(initialize).not.toHaveBeenCalled();
    expect(broadcast).toHaveBeenCalledWith({
      scope: 'week',
      isoYear: 2026,
      isoWeek: 33,
      reason: 'external-edit',
    });
  });
});
