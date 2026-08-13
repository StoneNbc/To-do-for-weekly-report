import type { IpcMain } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { IPC } from '../../../src/main/ipc/channels';
import { registerReportHandlers } from '../../../src/main/ipc/reportHandlers';
import type { AppLogger } from '../../../src/main/logging/logger';

type Handler = (_event: unknown, ...args: unknown[]) => Promise<unknown>;

const makeLogger = (): AppLogger => ({
  debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), flush: vi.fn(async () => undefined),
});

const setup = () => {
  const handlers = new Map<string, Handler>();
  const ipcMain = {
    handle: vi.fn((channel: string, handler: Handler) => handlers.set(channel, handler)),
    removeHandler: vi.fn(),
  };
  const reportService = {
    export: vi.fn(async () => ({ status: 'cancelled' as const })),
    openLast: vi.fn(async () => undefined),
    revealLast: vi.fn(),
  };
  registerReportHandlers({
    ipcMain: ipcMain as unknown as Pick<IpcMain, 'handle' | 'removeHandler'>,
    reportService,
    logger: makeLogger(),
  });
  return { handlers, reportService };
};

describe('report IPC handlers', () => {
  it('validates week input and never accepts a renderer-selected path', async () => {
    const { handlers, reportService } = setup();

    const invalid = await handlers.get(IPC.reportExport)?.({}, { isoYear: 2026, isoWeek: 99, path: '/tmp/escape' });
    const valid = await handlers.get(IPC.reportExport)?.({}, { isoYear: 2026, isoWeek: 33, path: '/tmp/ignored' });

    expect(invalid).toEqual({ status: 'failed', message: '周数无效，请刷新后重试' });
    expect(valid).toEqual({ status: 'cancelled' });
    expect(reportService.export).toHaveBeenCalledWith(2026, 33);
  });

  it('returns NOT_FOUND before any successful export path is authorized', async () => {
    const { handlers, reportService } = setup();
    reportService.openLast.mockRejectedValueOnce(Object.assign(new Error('没有导出'), { code: 'NOT_FOUND' }));

    const result = await handlers.get(IPC.reportOpenLast)?.({});

    expect(result).toEqual({ ok: false, error: { code: 'NOT_FOUND', message: '没有导出' } });
  });
});
