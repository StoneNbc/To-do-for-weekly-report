import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReportAgent, WeeklySnapshot } from '../../../src/shared/domain';
import type { AppLogger } from '../../../src/main/logging/logger';
import {
  NoExportedReportError,
  ReportService,
} from '../../../src/main/services/reportService';

const roots: string[] = [];

const snapshot: WeeklySnapshot = {
  isoYear: 2026,
  isoWeek: 33,
  weekStart: '2026-08-10',
  weekEnd: '2026-08-16',
  revision: 'r',
  groups: [
    {
      date: '2026-08-12',
      weekdayLabel: '周三',
      tasks: [{ date: '2026-08-12', content: '完成导出', time: '15:20' }],
    },
  ],
  total: 1,
};

const logger = (): AppLogger => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  flush: vi.fn(async () => undefined),
});

const templateAgent = (text = '周报正文'): ReportAgent => ({
  name: 'template',
  isAvailable: vi.fn(async () => true),
  generateReport: vi.fn(async () => text),
});

const setup = async (options?: { cancelled?: boolean; agent?: ReportAgent }) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sticky-report-'));
  roots.push(root);
  const selected = path.join(root, 'chosen', '周报.txt');
  const shell = { openPath: vi.fn(async () => ''), showItemInFolder: vi.fn() };
  const dialog = {
    showSaveDialog: vi.fn(async () =>
      options?.cancelled ? { canceled: true, filePath: '' } : { canceled: false, filePath: selected }),
  };
  const weeklyService = { getWeek: vi.fn(async () => snapshot) };
  const agent = options?.agent ?? templateAgent();
  const service = new ReportService({
    weeklyService,
    agentProvider: { getAgent: () => agent },
    dialog,
    shell,
    logger: logger(),
  });
  return { root, selected, shell, dialog, weeklyService, agent, service };
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('ReportService', () => {
  it('generates UTF-8 without BOM and writes only the selected path', async () => {
    const { root, selected, dialog, agent, service } = await setup();

    const result = await service.export(2026, 33);

    expect(result).toEqual({ status: 'saved', path: selected });
    expect(await readFile(selected, 'utf8')).toBe('周报正文');
    expect((await readFile(selected))[0]).not.toBe(0xef);
    expect(dialog.showSaveDialog).toHaveBeenCalledWith(undefined, expect.objectContaining({
      defaultPath: '周报-2026年第33周.txt',
    }));
    expect(agent.generateReport).toHaveBeenCalledWith(snapshot.groups[0]?.tasks, {
      isoYear: 2026,
      isoWeek: 33,
      weekStart: '2026-08-10',
      weekEnd: '2026-08-16',
    });
    expect(await readdir(root)).toEqual(['chosen']);
    expect(await readdir(path.join(root, 'chosen'))).toEqual(['周报.txt']);
  });

  it('does not write or authorize a path when the save dialog is cancelled', async () => {
    const { root, service } = await setup({ cancelled: true });

    expect(await service.export(2026, 33)).toEqual({ status: 'cancelled' });
    expect(service.getLastExportedPath()).toBeNull();
    expect(await readdir(root)).toEqual([]);
    await expect(service.openLast()).rejects.toBeInstanceOf(NoExportedReportError);
    expect(() => service.revealLast()).toThrow(NoExportedReportError);
  });

  it('authorizes only the most recent successful export for shell actions', async () => {
    const { selected, shell, service } = await setup();
    await service.export(2026, 33);

    await service.openLast();
    service.revealLast();

    expect(shell.openPath).toHaveBeenCalledWith(selected);
    expect(shell.showItemInFolder).toHaveBeenCalledWith(selected);
  });

  it('does not open a dialog or create a file when the agent fails', async () => {
    const agent = templateAgent();
    vi.mocked(agent.generateReport).mockRejectedValueOnce(new Error('agent failed'));
    const { root, dialog, service } = await setup({ agent });

    expect(await service.export(2026, 33)).toEqual({
      status: 'failed',
      message: '周报生成失败，请稍后重试',
    });
    expect(dialog.showSaveDialog).not.toHaveBeenCalled();
    expect(await readdir(root)).toEqual([]);
  });

  it('does not automatically open a saved report', async () => {
    const { shell, service } = await setup();

    await service.export(2026, 33);

    expect(shell.openPath).not.toHaveBeenCalled();
    expect(shell.showItemInFolder).not.toHaveBeenCalled();
  });
});
