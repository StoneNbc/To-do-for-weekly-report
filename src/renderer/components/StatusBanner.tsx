import type { ApiError } from '../../shared/results';

/** 持久展示 I/O/冲突错误并提供显式重试，不用短暂 Toast 隐藏重要失败。 */
export function StatusBanner({
  error,
  notice,
  onRetry,
}: {
  error: ApiError | null;
  notice?: string | null;
  onRetry?: () => void | Promise<void>;
}) {
  if (!error && !notice) return null;

  return (
    <div
      className={`no-drag flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-xs ${
        error ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-800'
      }`}
      role={error ? 'alert' : 'status'}
    >
      <span>{error?.message ?? notice}</span>
      {error && onRetry ? (
        <button
          className="rounded-md px-2 py-1 font-medium outline-none hover:bg-red-100 focus-visible:ring-2 focus-visible:ring-red-600"
          onClick={() => void onRetry()}
          type="button"
        >
          重试
        </button>
      ) : null}
    </div>
  );
}
