/** 可安全穿过 IPC 边界并展示给用户的错误代码。 */
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

/** 普通业务操作统一使用可判别联合，避免 Renderer 依赖异常对象序列化。 */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

/** 导出取消是正常状态，不应作为错误提示。 */
export type ExportReportResult =
  | { status: 'cancelled' }
  | { status: 'saved'; path: string }
  | { status: 'failed'; message: string };

export const ok = <T>(data: T): ApiResult<T> => ({ ok: true, data });

export const failure = (code: ApiErrorCode, message: string): ApiResult<never> => ({
  ok: false,
  error: { code, message },
});
