import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type {
  DayRecordSnapshot,
  HistoricalTaskView,
  TaskLocator,
  TodaySnapshot,
  TodayTaskView,
} from '../../shared/domain';
import type { ApiResult, ExportReportResult } from '../../shared/results';
import { addLocalDays, getIsoWeekInfo, getLocalDate } from '../../shared/dateUtils';
import { AddTaskInput } from '../components/AddTaskInput';
import { CompletedSection } from '../components/CompletedSection';
import { ExportResultToast } from '../components/ExportResultToast';
import { HistoricalInput } from '../components/HistoricalInput';
import { StatusBanner } from '../components/StatusBanner';
import { TaskItem } from '../components/TaskItem';
import { TaskList } from '../components/TaskList';
import { TitleBar } from '../components/TitleBar';
import { useElectronEvents } from '../hooks/useElectronEvents';
import { useElectronAPI } from '../hooks/useElectronAPI';
import { useRefreshQueue } from '../hooks/useRefreshQueue';
import { createInitialNoteState, noteReducer, type NoteSnapshot } from '../state/noteReducer';

function isTodaySnapshot(snapshot: NoteSnapshot | null): snapshot is TodaySnapshot {
  return snapshot !== null && 'currentDate' in snapshot;
}

export function FloatingNotePage() {
  const api = useElectronAPI();
  const today = getLocalDate();
  const [state, dispatch] = useReducer(noteReducer, today, createInitialNoteState);
  const [menuOpen, setMenuOpen] = useState(false);
  const [alwaysOnTop, setAlwaysOnTop] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<ExportReportResult | null>(null);
  const requestTokenRef = useRef(0);
  const watcherEchoRef = useRef<{ scope: 'today' | 'week'; expiresAt: number } | null>(null);

  const loadToday = useCallback(async () => {
    // 日期快速切换时只接受最后一次请求，防止较慢旧响应覆盖当前页面。
    const requestToken = ++requestTokenRef.current;
    dispatch({ type: 'load-start', mode: 'today', date: today });
    const result = await api.today.get();
    if (requestToken !== requestTokenRef.current) return;
    if (result.ok) dispatch({ type: 'load-success', snapshot: result.data });
    else dispatch({ type: 'load-failure', error: result.error });
  }, [api, today]);

  const loadHistory = useCallback(
    async (date: string) => {
      const requestToken = ++requestTokenRef.current;
      dispatch({ type: 'load-start', mode: 'history', date });
      const result = await api.history.getDay(date);
      if (requestToken !== requestTokenRef.current) return;
      if (result.ok) dispatch({ type: 'load-success', snapshot: result.data });
      else dispatch({ type: 'load-failure', error: result.error });
    },
    [api],
  );

  useEffect(() => {
    void loadToday();
  }, [loadToday]);

  useEffect(() => {
    if (!menuOpen) return;

    // 使用 pointerdown 可在 click 之前关闭菜单，并同时覆盖鼠标、触控笔和触屏。
    const closeWhenClickingOutside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      // 菜单本体与触发按钮不算“外部”，按钮仍可负责自身开关逻辑。
      if (
        target.closest('#floating-note-menu') ||
        target.closest('[aria-controls="floating-note-menu"]')
      ) {
        return;
      }
      setMenuOpen(false);
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };

    document.addEventListener('pointerdown', closeWhenClickingOutside);
    document.addEventListener('keydown', closeWithEscape);
    return () => {
      document.removeEventListener('pointerdown', closeWhenClickingOutside);
      document.removeEventListener('keydown', closeWithEscape);
    };
  }, [menuOpen]);

  const refresh = useCallback(async () => {
    if (state.mode === 'today') await loadToday();
    else await loadHistory(state.selectedDate);
  }, [loadHistory, loadToday, state.mode, state.selectedDate]);
  const queueRefresh = useRefreshQueue(refresh);

  useElectronEvents(
    useCallback(
      (event) => {
        // Mutation 已返回权威快照：只抑制紧随其后的一次 Watcher 回声，其他窗口稍后的写入仍可见。
        const watcherEcho = watcherEchoRef.current;
        if (
          event.reason === 'app-write' &&
          watcherEcho &&
          watcherEcho.scope === event.scope &&
          Date.now() <= watcherEcho.expiresAt
        ) {
          watcherEchoRef.current = null;
          return;
        }
        // 历史视图只响应当前所选日期所在周，避免其他周文件变化造成无意义刷新。
        const selectedWeek = getIsoWeekInfo(state.selectedDate);
        const affectsSelectedWeek =
          event.isoYear === undefined ||
          event.isoWeek === undefined ||
          (event.isoYear === selectedWeek.isoYear && event.isoWeek === selectedWeek.isoWeek);
        const affectsView =
          state.mode === 'today'
            ? event.scope === 'today'
            : event.scope === 'week' && affectsSelectedWeek;
        if (affectsView) {
          dispatch({
            type: 'set-notice',
            notice: event.reason === 'external-edit' ? '数据文件已在外部更新，正在刷新…' : null,
          });
          queueRefresh();
        }
      },
      [queueRefresh, state.mode, state.selectedDate],
    ),
  );

  const applyMutation = useCallback(
    async <T extends NoteSnapshot>(
      operation: () => Promise<ApiResult<T>>,
      successNotice?: string,
    ): Promise<boolean> => {
      dispatch({ type: 'mutation-start' });
      const result = await operation();
      if (result.ok) {
        // Main 返回的快照是唯一事实来源，不在前端乐观拼装任务列表。
        watcherEchoRef.current = {
          scope: state.mode === 'today' ? 'today' : 'week',
          expiresAt: Date.now() + 1_000,
        };
        dispatch({ type: 'mutation-success', snapshot: result.data, notice: successNotice });
        return true;
      }
      dispatch({ type: 'mutation-failure', error: result.error });
      if (result.error.code === 'FILE_CHANGED') {
        // 冲突后载入磁盘最新内容，但不自动重放用户动作，避免覆盖外部编辑。
        const requestToken = ++requestTokenRef.current;
        const latest =
          state.mode === 'today'
            ? await api.today.get()
            : await api.history.getDay(state.selectedDate);
        if (requestToken === requestTokenRef.current && latest.ok) {
          dispatch({
            type: 'mutation-success',
            snapshot: latest.data,
            notice: '数据文件已更新，已载入最新内容，请重新操作',
          });
        }
      }
      return false;
    },
    [api, state.mode, state.selectedDate],
  );

  const todayTasks = isTodaySnapshot(state.snapshot) ? state.snapshot.tasks : [];
  const pendingTasks = todayTasks.filter((task) => !task.completed);
  const completedTasks = todayTasks.filter((task) => task.completed);
  const historicalSnapshot =
    state.mode === 'history' && state.snapshot && !isTodaySnapshot(state.snapshot)
      ? state.snapshot
      : null;
  const saving = state.mutation === 'saving';

  const editToday = (task: TodayTaskView, content: string) => {
    // 编辑已完成任务时保留原完成时间，除非用户在历史模式显式修改时间。
    const input = task.completedAt
      ? { locator: task.locator, content, completedAt: task.completedAt }
      : { locator: task.locator, content };
    return applyMutation(() => api.today.edit(input));
  };

  const editHistorical = (task: HistoricalTaskView, content: string, completedAt?: string) => {
    const input = completedAt
      ? { date: task.date, locator: task.locator, content, completedAt }
      : { date: task.date, locator: task.locator, content };
    return applyMutation(() => api.history.edit(input));
  };

  const exportCurrentWeek = useCallback(async () => {
    setMenuOpen(false);
    setExportResult(null);
    setExporting(true);
    const week = getIsoWeekInfo(today);
    try {
      setExportResult(await api.report.export({ isoYear: week.isoYear, isoWeek: week.isoWeek }));
    } finally {
      setExporting(false);
    }
  }, [api, today]);

  const menu = useMemo(
    () =>
      menuOpen ? (
        <div
          className="no-drag absolute right-3 top-12 z-20 max-h-[calc(100vh-4rem)] w-44 max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-xl border border-amber-900/10 bg-white p-1.5 text-sm shadow-xl"
          id="floating-note-menu"
          role="menu"
        >
          <button
            className="menu-item"
            onClick={() => void api.window.openWeekly()}
            role="menuitem"
            type="button"
          >
            打开周记
          </button>
          <button
            className="menu-item"
            disabled={exporting}
            onClick={() => void exportCurrentWeek()}
            role="menuitem"
            type="button"
          >
            {exporting ? '正在准备周报…' : '导出本周周报'}
          </button>
          <button
            className="menu-item"
            onClick={() => void api.app.openDataFolder()}
            role="menuitem"
            type="button"
          >
            打开数据文件夹
          </button>
          <button
            aria-checked={alwaysOnTop}
            className="menu-item flex items-center justify-between"
            onClick={() => {
              const next = !alwaysOnTop;
              setAlwaysOnTop(next);
              void api.app.setAlwaysOnTop(next);
            }}
            role="menuitemcheckbox"
            type="button"
          >
            保持置顶 <span aria-hidden="true">{alwaysOnTop ? '✓' : ''}</span>
          </button>
          <button className="menu-item" disabled role="menuitem" type="button">
            设置（即将推出）
          </button>
          <button
            className="menu-item text-red-700"
            onClick={() => void api.app.quit()}
            role="menuitem"
            type="button"
          >
            退出
          </button>
        </div>
      ) : null,
    [alwaysOnTop, api, exportCurrentWeek, exporting, menuOpen],
  );

  return (
    <main className="relative flex h-screen min-h-[280px] flex-col overflow-hidden bg-note p-3 text-stone-800">
      <TitleBar
        isHistory={state.mode === 'history'}
        onNextDay={() => {
          const next = addLocalDays(state.selectedDate, 1);
          if (next === today) void loadToday();
          else if (next < today) void loadHistory(next);
        }}
        onOpenMenu={() => setMenuOpen((open) => !open)}
        onPreviousDay={() => void loadHistory(addLocalDays(state.selectedDate, -1))}
        onToday={() => void loadToday()}
        menuOpen={menuOpen}
        selectedDate={state.selectedDate}
      />
      {menu}
      <StatusBanner error={state.error} notice={state.notice} onRetry={refresh} />

      {exportResult ? (
        <div className="no-drag absolute inset-x-3 top-[3.35rem] z-10 max-h-[calc(100vh-4.25rem)] overflow-y-auto">
          <ExportResultToast
            compact
            onDismiss={() => setExportResult(null)}
            onOpen={() => void api.report.openLast()}
            onReveal={() => void api.report.revealLast()}
            result={exportResult}
          />
        </div>
      ) : null}

      <section className="min-h-0 flex-1 overflow-y-auto py-2" aria-busy={state.loading || saving}>
        {state.loading ? (
          <div className="grid h-full place-items-center" role="status">
            <p className="text-sm text-stone-500">正在读取本地记录…</p>
          </div>
        ) : state.mode === 'today' ? (
          <>
            <TaskList
              disabled={saving}
              onDelete={(locator) => void applyMutation(() => api.today.delete(locator))}
              onEdit={editToday}
              onToggle={(locator) => void applyMutation(() => api.today.toggle(locator))}
              tasks={pendingTasks}
            />
            <CompletedSection
              disabled={saving}
              expanded={state.completedExpanded}
              onDelete={(locator) => void applyMutation(() => api.today.delete(locator))}
              onEdit={editToday}
              onToggle={(locator) => void applyMutation(() => api.today.toggle(locator))}
              onToggleExpanded={() => dispatch({ type: 'toggle-completed' })}
              tasks={completedTasks}
            />
          </>
        ) : (
          <HistoricalRecords
            disabled={saving}
            onDelete={(locator) =>
              void applyMutation(() => api.history.delete({ date: state.selectedDate, locator }))
            }
            onEdit={editHistorical}
            snapshot={historicalSnapshot}
          />
        )}
      </section>

      {state.mode === 'today' ? (
        <AddTaskInput
          disabled={saving}
          onAdd={(content) => applyMutation(() => api.today.add(content))}
        />
      ) : (
        <HistoricalInput
          disabled={saving}
          onAdd={(content, completedAt) => {
            const input = completedAt
              ? { date: state.selectedDate, content, completedAt }
              : { date: state.selectedDate, content };
            return applyMutation(() => api.history.add(input), '已补录到所选历史日期');
          }}
        />
      )}
    </main>
  );
}

function HistoricalRecords({
  snapshot,
  disabled,
  onEdit,
  onDelete,
}: {
  snapshot: DayRecordSnapshot | null;
  disabled: boolean;
  onEdit: (
    task: HistoricalTaskView,
    content: string,
    completedAt?: string,
  ) => Promise<boolean> | boolean;
  onDelete: (locator: TaskLocator) => void;
}) {
  if (!snapshot || snapshot.tasks.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-stone-400/40 px-3 py-8 text-center text-sm text-stone-500">
        这一天还没有完成记录
        <br />
        <span className="text-xs">可在下方补录</span>
      </p>
    );
  }

  return (
    <ul aria-label="历史完成记录" className="space-y-1">
      {snapshot.tasks.map((task) => (
        <TaskItem
          completed
          completedAt={task.completedAt}
          content={task.content}
          disabled={disabled}
          key={`${task.locator.revision}:${task.locator.line}`}
          locator={task.locator}
          onDelete={onDelete}
          onEdit={(_, content, completedAt) => onEdit(task, content, completedAt)}
          editableTime
          readOnlyCompletion
        />
      ))}
    </ul>
  );
}
