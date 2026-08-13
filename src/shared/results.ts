export type ApiErrorCode =
  | 'INVALID_INPUT'
  | 'FILE_CHANGED'
  | 'NOT_FOUND'
  | 'INVALID_FILE'
  | 'IO_ERROR'
  | 'INTERNAL_ERROR'
  | 'NOT_IMPLEMENTED';

export interface ApiError {
  code: ApiErrorCode;
  message: string;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export type ExportReportResult =
  | { status: 'cancelled' }
  | { status: 'saved'; path: string }
  | { status: 'failed'; message: string };

export const ok = <T>(data: T): ApiResult<T> => ({ ok: true, data });

export const failure = (code: ApiErrorCode, message: string): ApiResult<never> => ({
  ok: false,
  error: { code, message },
});
