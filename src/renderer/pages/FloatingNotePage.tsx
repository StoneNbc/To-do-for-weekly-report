import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import type {
  AddedDateDisplay,
  DayRecordSnapshot,
  HistoryViewSnapshot,
  HistoricalTaskView,
  NoteDockSnapshot,
  TaskLocator,
  TodaySnapshot,
  TodayTaskView,
  SettingsSnapshot,
} from '../../shared/domain';
import type { ApiResult } from '../../shared/results';
import { addLocalDays, getIsoWeekInfo, getLocalDate } from '../../shared/dateUtils';
import { AddTaskInput } from '../components/AddTaskInput';
import { CompletedSection } from '../components/CompletedSection';
import { StatusBanner } from '../components/StatusBanner';
import { TaskItem } from '../components/TaskItem';
import { TaskList } from '../components/TaskList';
import { TitleBar } from '../components/TitleBar';
import { useElectronEvents } from '../hooks/useElectronEvents';
import { useElectronAPI } from '../hooks/useElectronAPI';
import { useRefreshQueue } from '../hooks/useRefreshQueue';
import { createInitialNoteState, noteReducer, type NoteSnapshot } from '../state/noteReducer';
import {
  DEFAULT_EDGE_REVEAL_COLOR,
  DEFAULT_NOTE_COLOR,
  DEFAULT_NOTE_OPACITY,
  EDGE_REVEAL_SIZE,
} from '../../shared/constants';
import { getNoteTheme } from '../../shared/noteAppearance';

function isTodaySnapshot(snapshot: NoteSnapshot | null): snapshot is TodaySnapshot {
  return snapshot !== null && 'currentDate' in snapshot;
}

/**
 * 悬浮便利贴主页面：展示今日/历史任务、已完成区、标题栏与菜单。
 * 负责加载与刷新数据、把用户操作通过 ElectronAPI 提交给 Main，并处理
 * 外部编辑事件、贴边自动隐藏状态与紧凑收起等桌面交互。
 */
export function FloatingNotePage() {
  const api = useElectronAPI();
  const today = getLocalDate();
  const [state, dispatch] = useReducer(noteReducer, today, createInitialNoteState);
  const [menuOpen, setMenuOpen] = useState(false);
  const [alwaysOnTop, setAlwaysOnTop] = useState(true);
  const [appearance, setAppearance] = useState({
    noteColor: DEFAULT_NOTE_COLOR,
    noteOpacity: DEFAULT_NOTE_OPACITY,
  });
  const [edgeRevealColor, setEdgeRevealColor] = useState(DEFAULT_EDGE_REVEAL_COLOR);
  const [exporting, setExporting] = useState(false);
  const requestTokenRef = useRef(0);
  const watcherEchoRef = useRef<{
    scopes: Array<'today' | 'week'>;
    expiresAt: number;
  } | null>(null);
  const [addedDateDisplay, setAddedDateDisplay] = useState<AddedDateDisplay>('hover');
  const [activeEditingKey, setActiveEditingKey] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [collapsePending, setCollapsePending] = useState(false);
  const [dockState, setDockState] = useState<NoteDockSnapshot>({
    edge: null,
    phase: 'undocked',
  });
  const [pointerInside, setPointerInside] = useState(false);
  const [textInputFocused, setTextInputFocused] = useState(false);
  const lastInteractionRef = useRef<string | null>(null);

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
      const result = await api.history.getView(date);
      if (requestToken !== requestTokenRef.current) return;
      if (result.ok) dispatch({ type: 'load-success', snapshot: result.data });
      else dispatch({ type: 'load-failure', error: result.error });
    },
    [api],
  );

  useEffect(() => {
    void loadToday();
  }, [loadToday]);

  const applySettings = useCallback((snapshot: SettingsSnapshot) => {
    setAlwaysOnTop(snapshot.alwaysOnTop);
    setAppearance({ noteColor: snapshot.noteColor, noteOpacity: snapshot.noteOpacity });
    setEdgeRevealColor(snapshot.edgeRevealColor);
    setAddedDateDisplay(snapshot.addedDateDisplay);
    dispatch({ type: 'set-completed-expanded', expanded: snapshot.completedExpanded });
  }, []);

  useEffect(() => {
    void api.settings.get().then((result) => {
      if (result.ok) applySettings(result.data);
    });
    const unsubscribeSettings = api.events.onSettingsChanged(applySettings);
    const unsubscribePreview = api.events.onAppearancePreviewed((preview) =>
      setAppearance(preview),
    );
    return () => {
      unsubscribeSettings();
      unsubscribePreview();
    };
  }, [api, applySettings]);

  useEffect(() => {
    let active = true;
    const unsubscribe = api.events.onNoteDockStateChanged((snapshot) => {
      if (active) setDockState(snapshot);
    });
    void api.window.getNoteDockState().then((snapshot) => {
      if (active) setDockState(snapshot);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [api]);

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
          watcherEcho.scopes.includes(event.scope as 'today' | 'week') &&
          Date.now() <= watcherEcho.expiresAt
        ) {
          watcherEcho.scopes = watcherEcho.scopes.filter((scope) => scope !== event.scope);
          if (watcherEcho.scopes.length === 0) watcherEchoRef.current = null;
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
            : event.scope === 'today' || (event.scope === 'week' && affectsSelectedWeek);
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
          scopes: state.mode === 'today' ? ['today'] : ['today', 'week'],
          expiresAt: Date.now() + 1_000,
        };
        dispatch({ type: 'mutation-success', snapshot: result.data, notice: successNotice });
        return true;
      }
      dispatch({ type: 'mutation-failure', error: result.error });
      if (result.error.code === 'IO_ERROR' && state.mode === 'history') {
        // 跨文件操作与回滚都可能只成功一部分；重新读取两个文件，但不掩盖原错误。
        const requestToken = ++requestTokenRef.current;
        const latest = await api.history.getView(state.selectedDate);
        if (requestToken === requestTokenRef.current && latest.ok) {
          dispatch({ type: 'refresh-after-failure', snapshot: latest.data });
        }
      }
      if (result.error.code === 'FILE_CHANGED') {
        // 冲突后载入磁盘最新内容，但不自动重放用户动作，避免覆盖外部编辑。
        const requestToken = ++requestTokenRef.current;
        const latest =
          state.mode === 'today'
            ? await api.today.get()
            : await api.history.getView(state.selectedDate);
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
  const historicalSnapshot: HistoryViewSnapshot | null =
    state.mode === 'history' && state.snapshot && !isTodaySnapshot(state.snapshot)
      ? state.snapshot
      : null;
  const historicalPendingTasks = historicalSnapshot?.backlog.tasks ?? [];
  const saving = state.mutation === 'saving';
  const autoHideBlocked =
    menuOpen || activeEditingKey !== null || textInputFocused || saving || collapsePending;

  useEffect(() => {
    const signature = `${pointerInside}:${autoHideBlocked}`;
    if (lastInteractionRef.current === signature) return;
    lastInteractionRef.current = signature;
    void api.window
      .setNoteInteractionState({ pointerInside, autoHideBlocked })
      .catch(() => undefined);
  }, [api, autoHideBlocked, pointerInside]);

  const editToday = (task: TodayTaskView, content: string, details: string) => {
    // 编辑已完成任务时保留原完成时间，除非用户在历史模式显式修改时间。
    const input = task.completedAt
      ? { locator: task.locator, content, details, completedAt: task.completedAt }
      : { locator: task.locator, content, details };
    return applyMutation(() => api.today.edit(input));
  };

  const editHistorical = (
    task: HistoricalTaskView,
    content: string,
    details: string,
    completedAt?: string,
  ) => {
    const input = completedAt
      ? { date: task.date, locator: task.locator, content, details, completedAt }
      : { date: task.date, locator: task.locator, content, details };
    return applyMutation(() => api.history.edit(input));
  };

  const editHistoricalPending = (task: TodayTaskView, content: string, details: string) =>
    applyMutation(() =>
      api.history.editPending({
        date: state.selectedDate,
        locator: task.locator,
        content,
        details,
      }),
    );

  const exportCurrentWeek = useCallback(async () => {
    setMenuOpen(false);
    setExporting(true);
    try {
      await api.window.generateCurrentWeekReport();
    } catch (cause) {
      dispatch({
        type: 'mutation-failure',
        error: {
          code: 'INTERNAL_ERROR',
          message: cause instanceof Error ? cause.message : '无法打开周报生成窗口，请稍后重试',
        },
      });
    } finally {
      setExporting(false);
    }
  }, [api]);

  const toggleCollapsed = useCallback(async () => {
    if (collapsePending) return;
    const next = !collapsed;
    setCollapsePending(true);
    setMenuOpen(false);
    setActiveEditingKey(null);
    try {
      setCollapsed(await api.window.setNoteCollapsed(next));
    } catch (cause) {
      dispatch({
        type: 'mutation-failure',
        error: {
          code: 'INTERNAL_ERROR',
          message: cause instanceof Error ? cause.message : '无法调整便利贴大小，请稍后重试',
        },
      });
    } finally {
      setCollapsePending(false);
    }
  }, [api, collapsePending, collapsed]);

  const toggleMenu = useCallback(async () => {
    if (!collapsed) {
      setMenuOpen((open) => !open);
      return;
    }
    if (collapsePending) return;

    setCollapsePending(true);
    try {
      const remainsCollapsed = await api.window.setNoteCollapsed(false);
      setCollapsed(remainsCollapsed);
      if (!remainsCollapsed) setMenuOpen(true);
    } catch (cause) {
      dispatch({
        type: 'mutation-failure',
        error: {
          code: 'INTERNAL_ERROR',
          message: cause instanceof Error ? cause.message : '无法打开便利贴菜单，请稍后重试',
        },
      });
    } finally {
      setCollapsePending(false);
    }
  }, [api, collapsePending, collapsed]);

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
              void api.settings.update({ alwaysOnTop: next }).then((result) => {
                if (!result.ok) {
                  setAlwaysOnTop(!next);
                  dispatch({ type: 'mutation-failure', error: result.error });
                }
              });
            }}
            role="menuitemcheckbox"
            type="button"
          >
            保持置顶 <span aria-hidden="true">{alwaysOnTop ? '✓' : ''}</span>
          </button>
          <button
            className="menu-item"
            onClick={() => {
              setMenuOpen(false);
              void api.window.openSettings();
            }}
            role="menuitem"
            type="button"
          >
            设置
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

  const theme = getNoteTheme(appearance.noteColor);
  const noteStyle = {
    '--note-bg': appearance.noteColor,
    '--note-fg': theme.foreground,
    '--note-muted': theme.muted,
    '--note-faint': theme.faint,
    '--note-surface': theme.surface,
    '--note-surface-strong': theme.surfaceStrong,
    '--note-border': theme.border,
    '--note-accent': theme.accent,
    '--note-focus': theme.focus,
    '--note-edge-reveal-color': edgeRevealColor,
    '--note-edge-reveal-size': `${EDGE_REVEAL_SIZE}px`,
  } as CSSProperties;

  return (
    <main
      className={`note-root relative flex h-screen flex-col overflow-hidden ${
        dockState.phase === 'hidden'
          ? 'min-h-0 p-0'
          : `p-3 ${collapsed ? 'min-h-0' : 'min-h-[280px]'}`
      }`}
      onBlurCapture={() => {
        queueMicrotask(() => {
          const active = document.activeElement;
          setTextInputFocused(
            active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement,
          );
        });
      }}
      onFocusCapture={(event) => {
        const target = event.target;
        setTextInputFocused(
          target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement,
        );
      }}
      onPointerEnter={() => setPointerInside(true)}
      onPointerLeave={() => setPointerInside(false)}
      style={noteStyle}
    >
      {dockState.phase === 'hidden' ? (
        <div
          aria-hidden="true"
          className={`note-edge-reveal note-edge-reveal-${dockState.edge ?? 'top'}`}
          data-testid="note-edge-reveal"
          title="展开便利贴"
        />
      ) : (
        <>
          <TitleBar
            collapsed={collapsed}
            collapsePending={collapsePending}
            isHistory={state.mode === 'history'}
            onNextDay={() => {
              const next = addLocalDays(state.selectedDate, 1);
              if (next === today) void loadToday();
              else if (next < today) void loadHistory(next);
            }}
            onOpenMenu={() => void toggleMenu()}
            onPreviousDay={() => void loadHistory(addLocalDays(state.selectedDate, -1))}
            onToday={() => void loadToday()}
            onToggleCollapsed={() => void toggleCollapsed()}
            menuOpen={menuOpen}
            selectedDate={state.selectedDate}
          />
          {!collapsed ? (
            <>
              {menu}
              <StatusBanner error={state.error} notice={state.notice} onRetry={refresh} />

              <section
                className="min-h-0 flex-1 overflow-y-auto py-2"
                aria-busy={state.loading || saving}
              >
                {state.loading ? (
                  <div className="grid h-full place-items-center" role="status">
                    <p className="text-sm text-stone-500">正在读取本地记录…</p>
                  </div>
                ) : state.mode === 'today' ? (
                  <>
                    <TaskList
                      activeEditingKey={activeEditingKey}
                      addedDateDisplay={addedDateDisplay}
                      disabled={saving}
                      onDelete={(locator) => void applyMutation(() => api.today.delete(locator))}
                      onEdit={editToday}
                      onEditingChange={setActiveEditingKey}
                      onToggle={(locator) => void applyMutation(() => api.today.toggle(locator))}
                      tasks={pendingTasks}
                    />
                    <CompletedSection
                      activeEditingKey={activeEditingKey}
                      addedDateDisplay={addedDateDisplay}
                      disabled={saving}
                      expanded={state.completedExpanded}
                      onDelete={(locator) => void applyMutation(() => api.today.delete(locator))}
                      onEdit={editToday}
                      onEditingChange={setActiveEditingKey}
                      onToggle={(locator) => void applyMutation(() => api.today.toggle(locator))}
                      onToggleExpanded={() => {
                        const previous = state.completedExpanded;
                        const next = !previous;
                        dispatch({ type: 'set-completed-expanded', expanded: next });
                        void api.settings.update({ completedExpanded: next }).then((result) => {
                          if (!result.ok) {
                            dispatch({ type: 'set-completed-expanded', expanded: previous });
                            dispatch({ type: 'mutation-failure', error: result.error });
                          }
                        });
                      }}
                      tasks={completedTasks}
                    />
                  </>
                ) : (
                  <>
                    <TaskList
                      activeEditingKey={activeEditingKey}
                      addedDateDisplay={addedDateDisplay}
                      disabled={saving}
                      onDelete={(locator) =>
                        void applyMutation(() =>
                          api.history.deletePending({ date: state.selectedDate, locator }),
                        )
                      }
                      onEdit={editHistoricalPending}
                      onEditingChange={setActiveEditingKey}
                      onToggle={(locator) =>
                        void applyMutation(() =>
                          api.history.completePending({ date: state.selectedDate, locator }),
                        )
                      }
                      tasks={historicalPendingTasks}
                    />
                    <HistoricalRecords
                      activeEditingKey={activeEditingKey}
                      addedDateDisplay={addedDateDisplay}
                      disabled={saving}
                      onDelete={(locator) =>
                        void applyMutation(() =>
                          api.history.delete({ date: state.selectedDate, locator }),
                        )
                      }
                      onEdit={editHistorical}
                      onEditingChange={setActiveEditingKey}
                      onToggle={(locator) =>
                        void applyMutation(() =>
                          api.history.reopenCompleted({ date: state.selectedDate, locator }),
                        )
                      }
                      snapshot={historicalSnapshot?.completed ?? null}
                    />
                  </>
                )}
              </section>

              {state.mode === 'today' ? (
                <AddTaskInput
                  disabled={saving}
                  onAdd={(content) => applyMutation(() => api.today.add(content))}
                />
              ) : (
                <AddTaskInput
                  disabled={saving}
                  onAdd={(content) =>
                    applyMutation(
                      () => api.history.addPending({ date: state.selectedDate, content }),
                      '已添加到全局待办',
                    )
                  }
                />
              )}
            </>
          ) : null}
        </>
      )}
    </main>
  );
}

function HistoricalRecords({
  snapshot,
  disabled,
  onEdit,
  onDelete,
  onToggle,
  addedDateDisplay,
  activeEditingKey,
  onEditingChange,
}: {
  snapshot: DayRecordSnapshot | null;
  disabled: boolean;
  onEdit: (
    task: HistoricalTaskView,
    content: string,
    details: string,
    completedAt?: string,
  ) => Promise<boolean> | boolean;
  onDelete: (locator: TaskLocator) => void;
  onToggle: (locator: TaskLocator) => void;
  addedDateDisplay: AddedDateDisplay;
  activeEditingKey: string | null;
  onEditingChange: (taskKey: string | null) => void;
}) {
  const tasks = snapshot?.tasks ?? [];

  return (
    <section
      className="mt-3 border-t border-amber-900/10 pt-2"
      aria-labelledby="history-completed-heading"
    >
      <h2 className="px-2 py-1.5 text-xs font-medium text-stone-500" id="history-completed-heading">
        已完成（{tasks.length}）
      </h2>
      {tasks.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-400/40 px-3 py-6 text-center text-sm text-stone-500">
          这一天还没有完成记录
          <br />
          <span className="text-xs">可从上方待办完成事项</span>
        </p>
      ) : (
        <ul aria-label="历史完成记录" className="space-y-1">
          {tasks.map((task) => (
            <TaskItem
              activeEditingKey={activeEditingKey}
              completed
              addedDate={task.addedDate}
              addedDateDisplay={addedDateDisplay}
              completedAt={task.completedAt}
              content={task.content}
              details={task.details}
              disabled={disabled}
              key={`${task.locator.revision}:${task.locator.line}`}
              locator={task.locator}
              onDelete={onDelete}
              onEditingChange={onEditingChange}
              onEdit={(_, content, details, completedAt) =>
                onEdit(task, content, details, completedAt)
              }
              onToggle={onToggle}
              editableTime
            />
          ))}
        </ul>
      )}
    </section>
  );
}
