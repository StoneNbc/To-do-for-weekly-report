import { describe, expect, it } from 'vitest';
import { mockTodaySnapshot, mockWeeklySnapshot } from '../../src/renderer/dev/mockElectronAPI';
import { createInitialNoteState, noteReducer } from '../../src/renderer/state/noteReducer';
import { createInitialWeeklyState, weeklyReducer } from '../../src/renderer/state/weeklyReducer';

describe('noteReducer', () => {
  it('在今日和历史模式之间切换，并记忆完成区展开状态', () => {
    const initial = createInitialNoteState('2026-08-13');
    const expanded = noteReducer(initial, { type: 'toggle-completed' });
    const history = noteReducer(expanded, {
      type: 'load-start',
      mode: 'history',
      date: '2026-08-12',
    });

    expect(history.mode).toBe('history');
    expect(history.selectedDate).toBe('2026-08-12');
    expect(history.completedExpanded).toBe(true);
    expect(history.loading).toBe(true);
  });

  it('保存成功后使用 Main 返回的快照而不是维护旁路任务数据', () => {
    const saving = noteReducer(createInitialNoteState('2026-08-13'), { type: 'mutation-start' });
    const saved = noteReducer(saving, {
      type: 'mutation-success',
      snapshot: mockTodaySnapshot,
      notice: '已保存',
    });

    expect(saved.snapshot).toEqual(mockTodaySnapshot);
    expect(saved.mutation).toBe('idle');
    expect(saved.notice).toBe('已保存');
  });
});

describe('weeklyReducer', () => {
  it('管理读取、导出和取消导出的状态', () => {
    const initial = createInitialWeeklyState({ isoYear: 2026, isoWeek: 33 });
    const loaded = weeklyReducer(initial, { type: 'load-success', snapshot: mockWeeklySnapshot });
    const exporting = weeklyReducer(loaded, { type: 'export-start' });
    const cancelled = weeklyReducer(exporting, {
      type: 'export-finish',
      result: { status: 'cancelled' },
    });

    expect(cancelled.snapshot?.total).toBe(3);
    expect(cancelled.exporting).toBe(false);
    expect(cancelled.exportResult).toEqual({ status: 'cancelled' });
  });
});
