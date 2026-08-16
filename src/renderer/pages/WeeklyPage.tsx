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

export function WeeklyPage() {
  const api = useElectronAPI();
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
          (event.scope === 'today' && isCurrentWeek) ||
          (event.scope === 'week' &&
            (event.isoYear === undefined || event.isoYear === state.selection.isoYear) &&
            (event.isoWeek === undefined || event.isoWeek === state.selection.isoWeek))
        ) {
          queueRefresh();
        }
      },
      [isCurrentWeek, queueRefresh, state.selection],
    ),
  );

  const range = state.snapshot
    ? `${state.snapshot.weekStart.replaceAll('-', '.')} — ${state.snapshot.weekEnd.replaceAll('-', '.')}`
    : '正在读取周范围…';

  const startGeneration = useCallback(async () => {
    const requestId = globalThis.crypto.randomUUID();
    generationRequestRef.current = requestId;
    setGenerating(true);
    setReportError(null);
    const result = await api.report.generate({ ...state.selection, requestId });
    if (generationRequestRef.current !== requestId) return;
    generationRequestRef.current = null;
    setGenerating(false);
    if (result.ok) {
      setReportDraft(result.data);
      setReportContent(result.data.content);
    } else if (result.error.code !== 'CANCELLED') {
      setReportError(result.error.message);
    }
  }, [api, state.selection]);

  const requestGeneration = useCallback(async () => {
    setReportError(null);
    const settings = await api.reportSettings.get();
    if (!settings.ok) {
      setReportError(settings.error.message);
      return;
    }
    if (settings.data.mode === 'remote-llm' && !settings.data.remoteConsentConfirmed) {
      setShowConsent(true);
      return;
    }
    await startGeneration();
  }, [api, startGeneration]);

  useEffect(
    () => api.events.onReportGenerationRequested(() => void requestGeneration()),
    [api, requestGeneration],
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

  const changeWeek = async (selection: IsoWeekInput) => {
    await cancelGeneration();
    await discardDraft();
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
            disabled={state.loading || generating || state.exporting}
            onClick={() => void requestGeneration()}
            type="button"
          >
            {generating ? '正在生成…' : '生成周报'}
          </button>
        </div>
      </header>

      <div className="mx-auto flex w-full min-w-0 max-w-4xl flex-1 flex-col gap-4 px-4 py-4 sm:px-6 sm:py-6">
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
        ) : !state.snapshot || state.snapshot.groups.length === 0 ? (
          <section className="grid flex-1 place-items-center rounded-2xl border border-dashed border-stone-300 bg-white p-6 text-center sm:p-12">
            <div>
              <p className="text-lg font-medium text-stone-700">本周暂无完成记录</p>
              <p className="mt-2 text-sm text-stone-400">完成任务后，它们会在这里按日期汇总。</p>
            </div>
          </section>
        ) : (
          <div className="space-y-4">
            {state.snapshot.groups.map((group) => (
              <DaySection group={group} key={group.date} />
            ))}
          </div>
        )}
      </div>

      {showConsent ? (
        <div className="fixed inset-0 z-20 grid place-items-center bg-black/35 p-4">
          <section
            aria-modal="true"
            className="max-w-md rounded-2xl bg-white p-6 shadow-xl"
            role="dialog"
          >
            <h2 className="text-lg font-semibold">确认使用远程模型</h2>
            <p className="mt-3 text-sm leading-6 text-stone-600">
              应用将把当前所选周的日期范围、已完成任务、本地工作记录模板、完整周报模板、写作提示词，以及当前未完成待办发送到你配置的服务地址。未完成待办仅作为“下周计划”候选。
            </p>
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
                  await startGeneration();
                }}
                type="button"
              >
                同意并生成
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <footer className="sticky bottom-0 border-t border-stone-200 bg-white/95 px-6 py-3 text-center text-sm text-stone-500 backdrop-blur">
        本周已完成 <strong className="text-stone-800">{state.snapshot?.total ?? 0}</strong> 项任务
      </footer>
    </main>
  );
}
