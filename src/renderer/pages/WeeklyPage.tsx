import { useCallback, useEffect, useMemo, useReducer } from 'react';
import { getDateFromIsoWeek, getIsoWeekInfo, getLocalDate } from '../../shared/dateUtils';
import type { IsoWeekInput } from '../../preload/apiTypes';
import { DaySection } from '../components/DaySection';
import { ExportResultToast } from '../components/ExportResultToast';
import { StatusBanner } from '../components/StatusBanner';
import { WeekNavigator } from '../components/WeekNavigator';
import { useElectronEvents } from '../hooks/useElectronEvents';
import { useElectronAPI } from '../hooks/useElectronAPI';
import { createInitialWeeklyState, weeklyReducer } from '../state/weeklyReducer';

function adjacentWeek(selection: IsoWeekInput, offset: -1 | 1): IsoWeekInput {
  const monday = getDateFromIsoWeek(selection.isoYear, selection.isoWeek, 1);
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

  const load = useCallback(async (selection: IsoWeekInput) => {
    dispatch({ type: 'load-start', selection });
    const result = await api.week.get(selection);
    if (result.ok) dispatch({ type: 'load-success', snapshot: result.data });
    else dispatch({ type: 'load-failure', error: result.error });
  }, [api]);

  useEffect(() => {
    void load(initialSelection);
  }, [initialSelection, load]);

  useElectronEvents(useCallback((event) => {
    if (
      event.scope === 'today' ||
      (event.scope === 'week' &&
        (event.isoYear === undefined || event.isoYear === state.selection.isoYear) &&
        (event.isoWeek === undefined || event.isoWeek === state.selection.isoWeek))
    ) {
      void load(state.selection);
    }
  }, [load, state.selection]));

  const isCurrentWeek = state.selection.isoYear === currentWeek.isoYear && state.selection.isoWeek === currentWeek.isoWeek;
  const range = state.snapshot
    ? `${state.snapshot.weekStart.replaceAll('-', '.')} — ${state.snapshot.weekEnd.replaceAll('-', '.')}`
    : '正在读取周范围…';

  const exportReport = async () => {
    dispatch({ type: 'export-start' });
    const result = await api.report.export(state.selection);
    dispatch({ type: 'export-finish', result });
  };

  return (
    <main className="flex min-h-screen flex-col bg-stone-50 text-stone-800">
      <header className="border-b border-stone-200 bg-white px-6 py-5">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-amber-700">Weekly journal</p>
            <WeekNavigator
              isoWeek={state.selection.isoWeek}
              isoYear={state.selection.isoYear}
              nextDisabled={isCurrentWeek}
              onNext={() => void load(adjacentWeek(state.selection, 1))}
              onPrevious={() => void load(adjacentWeek(state.selection, -1))}
              range={range}
            />
          </div>
          <button
            aria-label="一键导出周报 TXT"
            className="rounded-xl bg-stone-900 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 disabled:opacity-50"
            disabled={state.loading || state.exporting}
            onClick={() => void exportReport()}
            type="button"
          >
            {state.exporting ? '正在准备…' : '一键导出周报 TXT'}
          </button>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-6 py-6">
        <StatusBanner error={state.error} onRetry={() => void load(state.selection)} />
        {state.exportResult ? (
          <ExportResultToast
            onDismiss={() => dispatch({ type: 'dismiss-export' })}
            onOpen={() => void api.report.openLast()}
            onReveal={() => void api.report.revealLast()}
            result={state.exportResult}
          />
        ) : null}

        {state.loading ? (
          <div className="grid flex-1 place-items-center py-20" role="status">正在读取本地周记…</div>
        ) : !state.snapshot || state.snapshot.groups.length === 0 ? (
          <section className="grid flex-1 place-items-center rounded-2xl border border-dashed border-stone-300 bg-white p-12 text-center">
            <div><p className="text-lg font-medium text-stone-700">本周暂无完成记录</p><p className="mt-2 text-sm text-stone-400">完成任务后，它们会在这里按日期汇总。</p></div>
          </section>
        ) : (
          <div className="space-y-4">
            {state.snapshot.groups.map((group) => <DaySection group={group} key={group.date} />)}
          </div>
        )}
      </div>

      <footer className="sticky bottom-0 border-t border-stone-200 bg-white/95 px-6 py-3 text-center text-sm text-stone-500 backdrop-blur">
        本周已完成 <strong className="text-stone-800">{state.snapshot?.total ?? 0}</strong> 项任务
      </footer>
    </main>
  );
}
