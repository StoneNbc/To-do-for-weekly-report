import type { IpcMain } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { IPC } from '../../../src/main/ipc/channels';
import { registerSettingsHandlers } from '../../../src/main/ipc/settingsHandlers';
import type { AppLogger } from '../../../src/main/logging/logger';

type Handler = (_event: unknown, ...args: unknown[]) => Promise<unknown>;

const makeLogger = (): AppLogger => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  flush: vi.fn(async () => undefined),
});

const snapshot = {
  noteColor: '#FFF8E7',
  noteOpacity: 1,
  alwaysOnTop: true,
  completedExpanded: false,
  dataDirectory: '/safe/data',
};

const setup = () => {
  const handlers = new Map<string, Handler>();
  const ipcMain = {
    handle: vi.fn((channel: string, handler: Handler) => handlers.set(channel, handler)),
    removeHandler: vi.fn(),
  };
  const settings = {
    get: vi.fn(() => snapshot),
    previewAppearance: vi.fn(),
    update: vi.fn(async () => snapshot),
    resetAppearance: vi.fn(async () => snapshot),
  };
  const shellActions = {
    openLogsDirectory: vi.fn(async () => undefined),
    copyDataDirectoryPath: vi.fn(),
  };
  registerSettingsHandlers({
    ipcMain: ipcMain as unknown as Pick<IpcMain, 'handle' | 'removeHandler'>,
    settings,
    shellActions,
    logger: makeLogger(),
  });
  return { handlers, settings, shellActions };
};

describe('settings IPC handlers', () => {
  it('normalizes valid settings and rejects unknown keys', async () => {
    const { handlers, settings } = setup();

    const valid = await handlers.get(IPC.settingsUpdate)?.(
      {},
      {
        noteColor: '#e0f2fe',
        noteOpacity: 0.8,
      },
    );
    const invalid = await handlers.get(IPC.settingsUpdate)?.(
      {},
      {
        noteOpacity: 0.1,
        arbitraryPath: '/tmp/escape',
      },
    );

    expect(valid).toEqual({ ok: true, data: snapshot });
    expect(settings.update).toHaveBeenCalledWith({
      noteColor: '#E0F2FE',
      noteOpacity: 0.8,
    });
    expect(invalid).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
  });

  it('keeps diagnostic operations pathless', async () => {
    const { handlers, shellActions } = setup();

    await handlers.get(IPC.settingsOpenLogsFolder)?.({}, '/tmp/escape');
    await handlers.get(IPC.settingsCopyDataPath)?.({}, 'renderer text');

    expect(shellActions.openLogsDirectory).toHaveBeenCalledWith();
    expect(shellActions.copyDataDirectoryPath).toHaveBeenCalledWith();
  });
});
