import { useProjects } from '../hooks/useProjects';
import { ProjectSelect } from '../components/ProjectSelect';
import {
  matchesProject,
  type ProjectFilter,
  type ReportSourcePreview,
} from '../../shared/projects';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { getDateFromIsoWeek, getIsoWeekInfo, getLocalDate } from '../../shared/dateUtils';
import type { IsoWeekInput } from '../../preload/apiTypes';
import type { ReportDraft } from '../../shared/domain';
import { DaySection } from '../components/DaySection';
import { ExportResultToast } from '../components/ExportResultToast';
import { StatusBanner } from '../components/StatusBanner';
import { WeekNavigator } from '../components/WeekNavigator';
import { useElectronEvents } from '../hooks/useElectronEvents';
import { useElectronAPI } from '../hooks/useElectronAPI';
import { useRefreshQueue } from '../hooks/useRefreshQueue';
import { createInitialWeeklyState, weeklyReducer } from '../state/weeklyReducer';

function adjacentWeek(selection: IsoWeekInput, offset: -1 | 1): IsoWeekInput {
  const monday = getDateFromIsoWeek(selection.isoYear, selection.isoWeek, 1);
  // 以周一中午做本地 Date 位移，避开午夜附近可能发生的时区/DST 边界。
  const shifted = new Date(`${monday}T12:00:00`);
  shifted.setDate(shifted.getDate() + offset * 7);
  const info = getIsoWeekInfo(getLocalDate(shifted));
  return { isoYear: info.isoYear, isoWeek: info.isoWeek };
}

/**
 * 周记页面：按 ISO 周展示每日完成记录，并支持生成、编辑、保存或放弃周报草稿。
 * 远程模式首次生成前会要求确认数据发送范围；本地模板模式则完全离线渲染。
 */
export function WeeklyPage() {
  const api = useElectronAPI();
  const projectState = useProjects();
  const [projectFilter, setProjectFilter] = useState<ProjectFilter>({ kind: 'all' });
  const [groupBy, setGroupBy] = useState<'date' | 'project'>('date');
  const [includePendingCandidates, setIncludePendingCandidates] = useState(false);
  const [multiProject, setMultiProject] = useState(false);
  const [sourcePreview, setSourcePreview] = useState<ReportSourcePreview | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [sourceChanged, setSourceChanged] = useState(false);
  const sourceVersionRef = useRef(0);
  const [menuRequested, setMenuRequested] = useState(false);
  const currentWeek = getIsoWeekInfo(getLocalDate());
  const initialSelection = useMemo(
    () => ({ isoYear: currentWeek.isoYear, isoWeek: currentWeek.isoWeek }),
    [currentWeek.isoWeek, currentWeek.isoYear],
  );
  const [state, dispatch] = useReducer(weeklyReducer, initialSelection, createInitialWeeklyState);
  const requestTokenRef = useRef(0);
  const generationRequestRef = useRef<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [reportDraft, setReportDraft] = useState<ReportDraft | null>(null);
  const [reportContent, setReportContent] = useState('');
  const [reportError, setReportError] = useState<string | null>(null);
  const [showConsent, setShowConsent] = useState(false);

  const load = useCallback(
    async (selection: IsoWeekInput) => {
      // 周数快速切换时丢弃过期响应，保证标题、列表和统计来自同一选择。
      const requestToken = ++requestTokenRef.current;
      dispatch({ type: 'load-start', selection });
      const result = await api.week.get(selection);
      if (requestToken !== requestTokenRef.current) return;
      if (result.ok) dispatch({ type: 'load-success', snapshot: result.data });
      else dispatch({ type: 'load-failure', error: result.error });
    },
    [api],
  );
  const refreshSelection = useCallback(() => load(state.selection), [load, state.selection]);
  const queueRefresh = useRefreshQueue(refreshSelection);

  useEffect(() => {
    void load(initialSelection);
  }, [initialSelection, load]);

  const isCurrentWeek =
    state.selection.isoYear === currentWeek.isoYear &&
    state.selection.isoWeek === currentWeek.isoWeek;

  useElectronEvents(
    useCallback(
      (event) => {
        // today 只影响当前周；week 事件只影响其声明的目标周。
        if (
          event.scope === 'projects' ||
          (event.scope === 'today' && isCurrentWeek) ||
          (event.scope === 'week' &&
            (event.isoYear === undefined || event.isoYear === state.selection.isoYear) &&
            (event.isoWeek === undefined || event.isoWeek === state.selection.isoWeek))
        ) {
          queueRefresh();
          setSourcePreview(null);
          setShowConsent(false);
          setSourceChanged(true);
          sourceVersionRef.current++;
        }
      },
      [isCurrentWeek, queueRefresh, state.selection],
    ),
  );

  const range = state.snapshot
    ? `${state.snapshot.weekStart.replaceAll('-', '.')} — ${state.snapshot.weekEnd.replaceAll('-', '.')}`
    : '正在读取周范围…';

  const startGeneration = useCallback(
    async (previewToken?: string) => {
      const sourceVersion = sourceVersionRef.current;
      const requestId = globalThis.crypto.randomUUID();
      generationRequestRef.current = requestId;
      setGenerating(true);
      setReportError(null);
      const result = await api.report.generate({
        ...state.selection,
        requestId,
        projectFilter,
        groupBy,
        includePendingCandidates,
        ...(previewToken ? { previewToken } : {}),
      });
      if (generationRequestRef.current !== requestId) return;
      generationRequestRef.current = null;
      setGenerating(false);
      if (result.ok) {
        setSourceChanged(sourceVersionRef.current !== sourceVersion);
        setReportDraft(result.data);
        setReportContent(result.data.content);
      } else if (result.error.code !== 'CANCELLED') {
        setReportError(result.error.message);
      }
    },
    [api, state.selection, projectFilter, groupBy, includePendingCandidates],
  );

  const requestGeneration = useCallback(async () => {
    setReportError(null);
    setMenuRequested(false);
    const settings = await api.reportSettings.get();
    if (!settings.ok) {
      setReportError(settings.error.message);
      return;
    }
    if (settings.data.mode === 'remote-llm') {
      setPreparing(true);
      try {
        const preview = await api.report.preview({
          ...state.selection,
          projectFilter,
          groupBy,
          includePendingCandidates,
        });
        if (!preview.ok) {
          setReportError(preview.error.message);
          return;
        }
        setSourcePreview(preview.data);
        setShowConsent(true);
      } finally {
        setPreparing(false);
      }
      return;
    }
    await startGeneration();
  }, [api, startGeneration, state.selection, projectFilter, groupBy, includePendingCandidates]);

  useEffect(
    () =>
      api.events.onReportGenerationRequested(() => {
        setMenuRequested(true);
      }),
    [api],
  );

  const cancelGeneration = async () => {
    const requestId = generationRequestRef.current;
    generationRequestRef.current = null;
    setGenerating(false);
    if (requestId) await api.report.cancel(requestId);
  };

  const saveDraft = async () => {
    if (!reportDraft) return;
    dispatch({ type: 'export-start' });
    const result = await api.report.saveDraft({ draftId: reportDraft.id, content: reportContent });
    dispatch({ type: 'export-finish', result });
    if (result.status === 'saved') {
      setReportDraft(null);
      setReportContent('');
    }
  };

  const discardDraft = async () => {
    if (reportDraft) await api.report.discardDraft(reportDraft.id);
    setReportDraft(null);
    setReportContent('');
    setReportError(null);
  };

  const changeScope = (filter: ProjectFilter) => {
    sourceVersionRef.current++;
    setProjectFilter(filter);
    setSourcePreview(null);
    setShowConsent(false);
    setSourceChanged(true);
  };
  const filteredGroups = (state.snapshot?.groups ?? [])
    .map((group) => ({
      ...group,
      tasks: group.tasks.filter((task) => matchesProject(task.projectName, projectFilter)),
    }))
    .filter((group) => group.tasks.length > 0);
  const filteredTasks = filteredGroups.flatMap((group) => group.tasks);
  const projectNames = [...new Set(filteredTasks.map((task) => task.projectName ?? ''))];

  const changeWeek = async (selection: IsoWeekInput) => {
    await cancelGeneration();
    await discardDraft();
    setSourcePreview(null);
    setShowConsent(false);
    await load(selection);
  };

  return (
    <main className="flex min-h-screen min-w-0 flex-col overflow-x-hidden bg-stone-50 text-stone-800">
      <header className="border-b border-stone-200 bg-white px-4 py-4 sm:px-6 sm:py-5">
        <div className="mx-auto flex min-w-0 max-w-4xl flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-amber-700">
              Weekly journal
            </p>
            <WeekNavigator
              isoWeek={state.selection.isoWeek}
              isoYear={state.selection.isoYear}
              nextDisabled={isCurrentWeek}
              onNext={() => void changeWeek(adjacentWeek(state.selection, 1))}
              onPrevious={() => void changeWeek(adjacentWeek(state.selection, -1))}
              range={range}
            />
          </div>
          <button
            aria-label="生成周报草稿"
            className="w-full rounded-xl bg-stone-900 px-5 py-3 text-sm font-semibold text-white shadow-sm outline-none hover:bg-stone-700 focus-visible:ring-2 focus-visible:ring-amber-600 disabled:opacity-50 sm:w-auto"
            disabled={
              state.loading ||
              generating ||
              preparing ||
              state.exporting ||
              projectState.snapshot.recovery.blocked
            }
            onClick={() => void requestGeneration()}
            type="button"
          >
            {preparing ? '正在准备素材…' : generating ? '正在生成…' : '生成周报'}
          </button>
        </div>
      </header>

      <div className="mx-auto flex w-full min-w-0 max-w-4xl flex-1 flex-col gap-4 px-4 py-4 sm:px-6 sm:py-6">
        {menuRequested && (
          <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            请核对项目范围，再点击生成周报。
          </p>
        )}
        <section className="rounded-xl border border-stone-200 bg-white p-3 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-medium">项目范围</span>
            {!multiProject && (
              <ProjectSelect
                projects={projectState.snapshot.projects}
                value={projectFilter}
                onChange={changeScope}
                includeArchived
                disabled={generating || preparing}
              />
            )}
            <button
              className="text-xs underline"
              disabled={generating || preparing}
              onClick={() => {
                setMultiProject((value) => !value);
                changeScope({ kind: 'all' });
              }}
            >
              {multiProject ? '单选／全部' : '多选项目'}
            </button>
            <label className="flex items-center gap-2 text-xs">
              展示方式
              <select
                aria-label="周记与周报展示方式"
                className="rounded border px-2 py-1.5"
                disabled={generating || preparing}
                value={groupBy}
                onChange={(event) => {
                  setGroupBy(event.target.value as 'date' | 'project');
                  setSourcePreview(null);
                  setShowConsent(false);
                }}
              >
                <option value="date">按日期</option>
                <option value="project">按项目</option>
              </select>
            </label>
          </div>
          {multiProject && (
            <div className="mt-3 flex flex-wrap gap-3">
              {projectState.snapshot.projects.map((project) => (
                <label className="flex max-w-full items-center gap-1 text-xs" key={project.name}>
                  <input
                    type="checkbox"
                    disabled={generating || preparing}
                    checked={
                      projectFilter.kind === 'names' && projectFilter.names.includes(project.name)
                    }
                    onChange={(event) => {
                      const current = projectFilter.kind === 'names' ? projectFilter.names : [];
                      const names = event.target.checked
                        ? [...current, project.name]
                        : current.filter((name) => name !== project.name);
                      changeScope(names.length ? { kind: 'names', names } : { kind: 'all' });
                    }}
                  />
                  <span className="truncate">
                    {project.name}
                    {project.status === 'archived' ? '（已归档）' : ''}
                  </span>
                </label>
              ))}
              <p className="text-xs text-stone-500">未选择时包含全部项目。</p>
            </div>
          )}
          <label className="mt-3 flex items-start gap-2 text-xs text-stone-600">
            <input
              type="checkbox"
              aria-label="纳入当前未完成待办候选"
              checked={includePendingCandidates}
              disabled={generating || preparing}
              onChange={(event) => {
                setIncludePendingCandidates(event.target.checked);
                setSourcePreview(null);
                setShowConsent(false);
              }}
            />
            远程生成时，纳入所选项目的当前未完成待办作为下周计划候选
          </label>
          {projectState.error && (
            <p className="mt-2 text-xs text-red-700" role="alert">
              {projectState.error}
            </p>
          )}
          {projectState.snapshot.recovery.blocked && (
            <p className="mt-2 text-xs text-red-700" role="alert">
              项目改名需要恢复，请在便利贴的项目管理中处理。
            </p>
          )}
        </section>
        <StatusBanner error={state.error} onRetry={refreshSelection} />
        {reportError ? (
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
            {reportError}
          </div>
        ) : null}
        {generating ? (
          <div
            className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            role="status"
          >
            <span>正在生成周报，请稍候…</span>
            <button
              className="font-medium underline"
              onClick={() => void cancelGeneration()}
              type="button"
            >
              取消
            </button>
          </div>
        ) : null}
        {state.exportResult ? (
          <ExportResultToast
            onDismiss={() => dispatch({ type: 'dismiss-export' })}
            onOpen={() => void api.report.openLast()}
            onReveal={() => void api.report.revealLast()}
            result={state.exportResult}
          />
        ) : null}

        {reportDraft ? (
          <section className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold">周报草稿</h2>
                <p className="mt-1 text-xs text-stone-500">
                  {reportDraft.mode === 'remote-llm' ? '由远程模型生成' : '由本地模板生成'}
                  ，保存前可继续编辑。
                  {sourceChanged && (
                    <span className="ml-2 text-amber-700">
                      原始记录已更新，当前草稿保留生成时内容，可重新生成。
                    </span>
                  )}
                </p>
              </div>
              <span className="text-xs text-stone-400">尚未写入文件</span>
            </div>
            <textarea
              aria-label="周报草稿内容"
              className="mt-4 min-h-80 w-full resize-y rounded-xl border border-stone-300 p-3 font-mono text-sm leading-6 outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-100"
              onChange={(event) => setReportContent(event.target.value)}
              spellCheck={false}
              value={reportContent}
            />
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <button
                className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium hover:bg-stone-100"
                disabled={state.exporting}
                onClick={() => void discardDraft()}
                type="button"
              >
                放弃草稿
              </button>
              <button
                className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-700 disabled:opacity-50"
                disabled={state.exporting || !reportContent.trim()}
                onClick={() => void saveDraft()}
                type="button"
              >
                {state.exporting ? '正在保存…' : '选择位置并保存'}
              </button>
            </div>
          </section>
        ) : null}

        {state.loading ? (
          <div className="grid flex-1 place-items-center py-20" role="status">
            正在读取本地周记…
          </div>
        ) : !state.snapshot || filteredGroups.length === 0 ? (
          <section className="grid flex-1 place-items-center rounded-2xl border border-dashed border-stone-300 bg-white p-6 text-center sm:p-12">
            <div>
              <p className="text-lg font-medium text-stone-700">本周暂无完成记录</p>
              <p className="mt-2 text-sm text-stone-400">完成任务后，它们会在这里按日期汇总。</p>
            </div>
          </section>
        ) : (
          <div className="space-y-4">
            {groupBy === 'date'
              ? filteredGroups.map((group) => <DaySection group={group} key={group.date} />)
              : projectNames.map((name) => (
                  <section
                    key={JSON.stringify(name)}
                    className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm"
                  >
                    <h3 className="mb-3 font-semibold">{name || '未分类'}</h3>
                    <ul className="space-y-2">
                      {filteredTasks
                        .filter((task) => (task.projectName ?? '') === name)
                        .map((task, index) => (
                          <li key={index} className="flex gap-3 text-sm">
                            <time className="shrink-0 text-xs text-stone-500">
                              {task.date.slice(5)}
                            </time>
                            <span className="min-w-0 flex-1 break-words">{task.content}</span>
                            {task.time && (
                              <time className="text-xs text-stone-400">{task.time}</time>
                            )}
                          </li>
                        ))}
                    </ul>
                  </section>
                ))}
          </div>
        )}
      </div>

      {showConsent ? (
        <div className="fixed inset-0 z-20 grid place-items-center bg-black/35 p-4">
          <section
            aria-modal="true"
            className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
            role="dialog"
          >
            <h2 className="text-lg font-semibold">确认使用远程模型</h2>
            <p className="mt-3 text-sm leading-6 text-stone-600">
              应用将发送下方预览中的项目名、任务标题、日期与可选完成时间，以及模板和写作提示词。只有勾选后才纳入当前未完成待办候选；不发送任务详情或项目目录文件。
            </p>
            {sourcePreview && (
              <>
                <p className="mt-2 text-xs text-stone-500">
                  完成记录 {sourcePreview.taskCount} 项，待办候选 {sourcePreview.pendingCount} 项
                </p>
                <pre
                  aria-label="将发送的周报素材"
                  className="mt-3 min-h-24 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-stone-100 p-3 text-xs leading-5"
                >
                  {sourcePreview.text}
                </pre>
              </>
            )}
            <p className="mt-2 text-sm font-medium text-stone-700">
              远程服务的数据处理规则由该服务商负责。
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                className="rounded-lg border px-4 py-2 text-sm"
                onClick={() => setShowConsent(false)}
                type="button"
              >
                取消
              </button>
              <button
                className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white"
                onClick={async () => {
                  const result = await api.reportSettings.confirmConsent();
                  if (!result.ok) {
                    setShowConsent(false);
                    setReportError(result.error.message);
                    return;
                  }
                  setShowConsent(false);
                  await startGeneration(sourcePreview?.token);
                }}
                type="button"
                disabled={!sourcePreview}
              >
                同意并生成
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <footer className="sticky bottom-0 border-t border-stone-200 bg-white/95 px-6 py-3 text-center text-sm text-stone-500 backdrop-blur">
        本周已完成 <strong className="text-stone-800">{filteredTasks.length}</strong> 项任务
      </footer>
    </main>
  );
}
