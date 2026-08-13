import type { ExportReportResult } from '../../shared/results';

export function ExportResultToast({
  result,
  onOpen,
  onReveal,
  onDismiss,
}: {
  result: ExportReportResult;
  onOpen: () => void;
  onReveal: () => void;
  onDismiss: () => void;
}) {
  if (result.status === 'cancelled') {
    return <div className="rounded-xl bg-stone-100 px-4 py-3 text-sm text-stone-600" role="status">已取消导出。</div>;
  }
  if (result.status === 'failed') {
    return <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{result.message}</div>;
  }

  return (
    <aside className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900" aria-label="导出成功">
      <p className="break-all">已保存到：{result.path}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="toast-button" onClick={onOpen} type="button">打开文件</button>
        <button className="toast-button" onClick={onReveal} type="button">打开所在文件夹</button>
        <button className="toast-button" onClick={onDismiss} type="button">完成</button>
      </div>
    </aside>
  );
}
