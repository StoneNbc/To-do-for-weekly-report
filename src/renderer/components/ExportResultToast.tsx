import type { ExportReportResult } from '../../shared/results';

/** 明确区分取消、失败和成功；只有成功态允许打开或定位文件。 */
export function ExportResultToast({
  result,
  onOpen,
  onReveal,
  onDismiss,
  compact = false,
}: {
  result: ExportReportResult;
  onOpen: () => void;
  onReveal: () => void;
  onDismiss: () => void;
  compact?: boolean;
}) {
  if (result.status === 'cancelled') {
    return (
      <div
        aria-label="导出已取消"
        className="flex items-center justify-between gap-3 rounded-xl bg-stone-100 px-4 py-3 text-sm text-stone-600"
        role="status"
      >
        <span>已取消导出，未创建任何文件。</span>
        <button className="toast-button focus-visible:ring-2" onClick={onDismiss} type="button">
          完成
        </button>
      </div>
    );
  }
  if (result.status === 'failed') {
    return (
      <div
        aria-label="导出失败"
        className="flex items-center justify-between gap-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800"
        role="alert"
      >
        <span className="min-w-0 break-words">导出失败：{result.message}</span>
        <button
          className="error-toast-button focus-visible:ring-2"
          onClick={onDismiss}
          type="button"
        >
          关闭
        </button>
      </div>
    );
  }

  return (
    <aside
      aria-label="导出成功"
      aria-live="polite"
      className={`min-w-0 rounded-xl border border-emerald-200 bg-emerald-50 text-sm text-emerald-900 ${compact ? 'p-3' : 'p-4'}`}
    >
      <p className="break-all">已保存到：{result.path}</p>
      <p className="mt-1 text-xs text-emerald-700">文件不会自动打开。</p>
      <div className={`${compact ? 'mt-2' : 'mt-3'} flex flex-wrap gap-2`}>
        <button className="toast-button focus-visible:ring-2" onClick={onOpen} type="button">
          打开文件
        </button>
        <button className="toast-button focus-visible:ring-2" onClick={onReveal} type="button">
          打开所在文件夹
        </button>
        <button className="toast-button focus-visible:ring-2" onClick={onDismiss} type="button">
          完成
        </button>
      </div>
    </aside>
  );
}
