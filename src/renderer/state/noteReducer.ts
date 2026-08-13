import type { DayRecordSnapshot, TodaySnapshot } from '../../shared/domain';
import type { ApiError } from '../../shared/results';

export type NoteSnapshot = TodaySnapshot | DayRecordSnapshot;

export interface NoteState {
  mode: 'today' | 'history';
  selectedDate: string;
  snapshot: NoteSnapshot | null;
  completedExpanded: boolean;
  loading: boolean;
  mutation: 'idle' | 'saving';
  error: ApiError | null;
  notice: string | null;
}

export type NoteAction =
  | { type: 'load-start'; mode: NoteState['mode']; date: string }
  | { type: 'load-success'; snapshot: NoteSnapshot }
  | { type: 'load-failure'; error: ApiError }
  | { type: 'mutation-start' }
  | { type: 'mutation-success'; snapshot: NoteSnapshot; notice?: string | undefined }
  | { type: 'mutation-failure'; error: ApiError }
  | { type: 'toggle-completed' }
  | { type: 'set-notice'; notice: string | null }
  | { type: 'clear-error' };

export function createInitialNoteState(today: string): NoteState {
  return {
    mode: 'today',
    selectedDate: today,
    snapshot: null,
    completedExpanded: false,
    loading: true,
    mutation: 'idle',
    error: null,
    notice: null,
  };
}

export function noteReducer(state: NoteState, action: NoteAction): NoteState {
  switch (action.type) {
    case 'load-start':
      return {
        ...state,
        mode: action.mode,
        selectedDate: action.date,
        loading: true,
        error: null,
        notice: null,
      };
    case 'load-success':
      return { ...state, snapshot: action.snapshot, loading: false, error: null };
    case 'load-failure':
      return { ...state, loading: false, error: action.error };
    case 'mutation-start':
      return { ...state, mutation: 'saving', error: null, notice: null };
    case 'mutation-success':
      return {
        ...state,
        snapshot: action.snapshot,
        mutation: 'idle',
        error: null,
        notice: action.notice ?? null,
      };
    case 'mutation-failure':
      return { ...state, mutation: 'idle', error: action.error };
    case 'toggle-completed':
      return { ...state, completedExpanded: !state.completedExpanded };
    case 'set-notice':
      return { ...state, notice: action.notice };
    case 'clear-error':
      return { ...state, error: null };
  }
}
