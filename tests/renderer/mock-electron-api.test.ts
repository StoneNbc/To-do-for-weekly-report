import { describe, expect, it } from 'vitest';
import type { ElectronAPI } from '../../src/preload/apiTypes';
import { createMockElectronAPI } from '../../src/renderer/dev/mockElectronAPI';

describe('MockElectronAPI contracts', () => {
  it('保持 ElectronAPI 类型，并覆盖重复、历史和空周 fixture', async () => {
    const api: ElectronAPI = createMockElectronAPI('empty-week').api;
    const today = await api.today.get();
    const history = await api.history.getDay('2026-08-12');
    const week = await api.week.get({ isoYear: 2026, isoWeek: 33 });

    expect(today.ok && today.data.tasks.filter((task) => task.content === '重复记录')).toHaveLength(2);
    expect(history.ok && history.data.tasks[0]?.date).toBe('2026-08-12');
    expect(week.ok && week.data.total).toBe(0);
  });

  it.each([
    ['file-changed', 'FILE_CHANGED'],
    ['io-error', 'IO_ERROR'],
  ] as const)('模拟 %s 错误', async (scenario, code) => {
    const result = await createMockElectronAPI(scenario).api.today.add('任务');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(code);
  });

  it('模拟导出取消', async () => {
    const result = await createMockElectronAPI('export-cancelled').api.report.export({
      isoYear: 2026,
      isoWeek: 33,
    });
    expect(result).toEqual({ status: 'cancelled' });
  });
});
