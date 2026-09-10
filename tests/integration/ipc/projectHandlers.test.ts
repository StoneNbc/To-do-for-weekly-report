import type { IpcMain } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { IPC } from '../../../src/main/ipc/channels';
import { registerProjectHandlers } from '../../../src/main/ipc/projectHandlers';
import type { ProjectService } from '../../../src/main/services/projectService';
import type { AppLogger } from '../../../src/main/logging/logger';

describe('project creation IPC', () => {
  it('notifies the originating window only after a valid creation succeeds and removes handlers', async () => {
    const handlers = new Map<string, (_event: unknown, input?: unknown) => Promise<unknown>>();
    const ipcMain = {
      handle: vi.fn((channel, handler) => handlers.set(channel, handler)),
      removeHandler: vi.fn(),
    };
    const onCreated = vi.fn();
    const create = vi.fn(async () => ({
      revision: 'r2',
      projects: [],
      warnings: [],
      recovery: { blocked: false, message: '', files: [] },
    }));
    const cleanup = registerProjectHandlers({
      ipcMain: ipcMain as unknown as Pick<IpcMain, 'handle' | 'removeHandler'>,
      projects: { create } as unknown as ProjectService,
      task: { moveMany: vi.fn() },
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        flush: vi.fn(),
      } as AppLogger,
      broadcast: vi.fn(),
      openRecovery: vi.fn(),
      onCreated,
    });
    const handler = handlers.get(IPC.projectsCreate)!;
    const event = { sender: { id: 42 } };
    expect(await handler(event, { name: ' 项目2 ', expectedRevision: 'r1' })).toMatchObject({
      ok: true,
    });
    expect(onCreated).toHaveBeenCalledWith('项目2', 42);
    create.mockRejectedValueOnce(new Error('write failed'));
    expect(await handler(event, { name: '项目3', expectedRevision: 'r2' })).toMatchObject({
      ok: false,
    });
    expect(await handler(event, { name: '', expectedRevision: 'r2' })).toMatchObject({ ok: false });
    expect(onCreated).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledTimes(2);
    cleanup();
    expect(ipcMain.removeHandler.mock.calls.map((call) => call[0])).toEqual([...handlers.keys()]);
  });
});
