import type { WeeklySnapshot } from '../../shared/domain';
import type { ApiError, ExportReportResult } from '../../shared/results';
import type { IsoWeekInput } from '../../preload/apiTypes';

export interface WeeklyState {
  selection: IsoWeekInput;
  snapshot: WeeklySnapshot | null;
  loading: boolean;
  exporting: boolean;
  exportResult: ExportReportResult | null;
  error: ApiError | null;
}

export type WeeklyAction =
  | { type: 'load-start'; selection: IsoWeekInput }
  | { type: 'load-success'; snapshot: WeeklySnapshot }
  | { type: 'load-failure'; error: ApiError }
  | { type: 'export-start' }
  | { type: 'export-finish'; result: ExportReportResult }
  | { type: 'export-failure'; error: ApiError }
  | { type: 'dismiss-export' };

export function createInitialWeeklyState(selection: IsoWeekInput): WeeklyState {
  return {
    selection,
    snapshot: null,
    loading: true,
    exporting: false,
    exportResult: null,
    error: null,
  };
}

export function weeklyReducer(state: WeeklyState, action: WeeklyAction): WeeklyState {
  switch (action.type) {
    case 'load-start':
      return {
        ...state,
        selection: action.selection,
        loading: true,
        error: null,
        exportResult: null,
      };
    case 'load-success':
      return { ...state, snapshot: action.snapshot, loading: false, error: null };
    case 'load-failure':
      return { ...state, loading: false, error: action.error };
    case 'export-start':
      return { ...state, exporting: true, error: null, exportResult: null };
    case 'export-finish':
      return { ...state, exporting: false, exportResult: action.result };
    case 'export-failure':
      return { ...state, exporting: false, error: action.error };
    case 'dismiss-export':
      return { ...state, exportResult: null };
  }
}
