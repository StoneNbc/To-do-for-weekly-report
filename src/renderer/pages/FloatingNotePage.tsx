import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type {
  DayRecordSnapshot,
  HistoricalTaskView,
  TaskLocator,
  TodaySnapshot,
  TodayTaskView,
} from '../../shared/domain';
import type { ApiResult } from '../../shared/results';
import { addLocalDays, getIsoWeekInfo, getLocalDate } from '../../shared/dateUtils';
import { AddTaskInput } from '../components/AddTaskInput';
import { CompletedSection } from '../components/CompletedSection';
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
  const requestTokenRef = useRef(0);
  const watcherEchoRef = useRef<{ scope: 'today' | 'week'; expiresAt: number } | null>(null);

  const loadToday = useCallback(async () => {
    const requestToken = ++requestTokenRef.current;
    dispatch({ type: 'load-start', mode: 'today', date: today });
    const result = await api.today.get();
    if (requestToken !== requestTokenRef.current) return;
    if (result.ok) dispatch({ type: 'load-success', snapshot: result.data });
    else dispatch({ type: 'load-failure', error: result.error });
  }, [api, today]);

  const loadHistory = useCallback(async (date: string) => {
    const requestToken = ++requestTokenRef.current;
    dispatch({ type: 'load-start', mode: 'history', date });
    const result = await api.history.getDay(date);
    if (requestToken !== requestTokenRef.current) return;
    if (result.ok) dispatch({ type: 'load-success', snapshot: result.data });
    else dispatch({ type: 'load-failure', error: result.error });
  }, [api]);

  useEffect(() => {
    void loadToday();
  }, [loadToday]);

  const refresh = useCallback(async () => {
    if (state.mode === 'today') await loadToday();
    else await loadHistory(state.selectedDate);
  }, [loadHistory, loadToday, state.mode, state.selectedDate]);
  const queueRefresh = useRefreshQueue(refresh);

  useElectronEvents(useCallback((event) => {
    // Mutating ElectronAPI methods already return the authoritative snapshot.
    // Suppress one nearby watcher echo, but keep later app writes from other windows observable.
    const watcherEcho = watcherEchoRef.current;
    if (
      event.reason === 'app-write' && watcherEcho &&
      watcherEcho.scope === event.scope && Date.now() <= watcherEcho.expiresAt
    ) {
      watcherEchoRef.current = null;
      return;
    }
    const selectedWeek = getIsoWeekInfo(state.selectedDate);
    const affectsSelectedWeek =
      event.isoYear === undefined || event.isoWeek === undefined ||
      (event.isoYear === selectedWeek.isoYear && event.isoWeek === selectedWeek.isoWeek);
    const affectsView = state.mode === 'today'
      ? event.scope === 'today'
      : event.scope === 'week' && affectsSelectedWeek;
    if (affectsView) {
      dispatch({
        type: 'set-notice',
        notice: event.reason === 'external-edit' ? '数据文件已在外部更新，正在刷新…' : null,
      });
      queueRefresh();
    }
  }, [queueRefresh, state.mode, state.selectedDate]));

  const applyMutation = useCallback(async <T extends NoteSnapshot>(
    operation: () => Promise<ApiResult<T>>,
    successNotice?: string,
  ): Promise<boolean> => {
    dispatch({ type: 'mutation-start' });
    const result = await operation();
    if (result.ok) {
      watcherEchoRef.current = {
        scope: state.mode === 'today' ? 'today' : 'week',
        expiresAt: Date.now() + 1_000,
      };
      dispatch({ type: 'mutation-success', snapshot: result.data, notice: successNotice });
      return true;
    }
    dispatch({ type: 'mutation-failure', error: result.error });
    if (result.error.code === 'FILE_CHANGED') {
      const requestToken = ++requestTokenRef.current;
      const latest = state.mode === 'today'
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
  }, [api, state.mode, state.selectedDate]);

  const todayTasks = isTodaySnapshot(state.snapshot) ? state.snapshot.tasks : [];
  const pendingTasks = todayTasks.filter((task) => !task.completed);
  const completedTasks = todayTasks.filter((task) => task.completed);
  const historicalSnapshot = state.mode === 'history' && state.snapshot && !isTodaySnapshot(state.snapshot)
    ? state.snapshot
    : null;
  const saving = state.mutation === 'saving';

  const editToday = (task: TodayTaskView, content: string) => {
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

  const menu = useMemo(() => menuOpen ? (
    <div className="no-drag absolute right-3 top-12 z-20 w-44 rounded-xl border border-amber-900/10 bg-white p-1.5 text-sm shadow-xl" role="menu">
      <button className="menu-item" onClick={() => void api.window.openWeekly()} role="menuitem" type="button">打开周记</button>
      <button
        className="menu-item"
        onClick={() => {
          const week = getIsoWeekInfo(today);
          void api.report.export({ isoYear: week.isoYear, isoWeek: week.isoWeek });
        }}
        role="menuitem"
        type="button"
      >
        导出本周周报
      </button>
      <button className="menu-item" onClick={() => void api.app.openDataFolder()} role="menuitem" type="button">打开数据文件夹</button>
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
      <button className="menu-item" disabled role="menuitem" type="button">设置（即将推出）</button>
      <button className="menu-item text-red-700" onClick={() => void api.app.quit()} role="menuitem" type="button">退出</button>
    </div>
  ) : null, [alwaysOnTop, api, menuOpen, today]);

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
        selectedDate={state.selectedDate}
      />
      {menu}
      <StatusBanner error={state.error} notice={state.notice} onRetry={refresh} />

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
            onDelete={(locator) => void applyMutation(() => api.history.delete({ date: state.selectedDate, locator }))}
            onEdit={editHistorical}
            snapshot={historicalSnapshot}
          />
        )}
      </section>

      {state.mode === 'today' ? (
        <AddTaskInput disabled={saving} onAdd={(content) => applyMutation(() => api.today.add(content))} />
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
  onEdit: (task: HistoricalTaskView, content: string, completedAt?: string) => Promise<boolean> | boolean;
  onDelete: (locator: TaskLocator) => void;
}) {
  if (!snapshot || snapshot.tasks.length === 0) {
    return <p className="rounded-xl border border-dashed border-stone-400/40 px-3 py-8 text-center text-sm text-stone-500">这一天还没有完成记录<br /><span className="text-xs">可在下方补录</span></p>;
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
