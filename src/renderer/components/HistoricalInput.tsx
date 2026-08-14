import { useState, type FormEvent } from 'react';

/** 历史补录输入，完成时间可选，目标日期由父页面固定。 */
export function HistoricalInput({
  disabled = false,
  onAdd,
}: {
  disabled?: boolean;
  onAdd: (content: string, completedAt?: string) => Promise<boolean> | boolean;
}) {
  const [content, setContent] = useState('');
  const [completedAt, setCompletedAt] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const normalized = content.trim();
    if (!normalized) {
      setError('请输入要补录的完成事项');
      return;
    }
    setError(null);
    const saved = completedAt ? await onAdd(normalized, completedAt) : await onAdd(normalized);
    if (saved) {
      setContent('');
      setCompletedAt('');
    }
  };

  return (
    <form
      className="no-drag border-t border-amber-900/10 pt-3"
      onSubmit={(event) => void submit(event)}
    >
      <label className="sr-only" htmlFor="historical-content">
        补录已完成事项
      </label>
      <div className="grid grid-cols-[minmax(0,1fr)_4.8rem_auto] items-center gap-1 rounded-xl bg-white/60 p-1.5 ring-1 ring-amber-900/10 focus-within:ring-2 focus-within:ring-amber-600 sm:gap-2">
        <input
          aria-describedby={error ? 'historical-error' : undefined}
          className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-sm outline-none"
          disabled={disabled}
          id="historical-content"
          onChange={(event) => setContent(event.target.value)}
          placeholder="补录已完成事项…"
          value={content}
        />
        <input
          aria-label="完成时间（可选）"
          className="min-w-0 rounded-md bg-white/70 px-1 py-1.5 text-xs outline-none"
          disabled={disabled}
          onChange={(event) => setCompletedAt(event.target.value)}
          type="time"
          value={completedAt}
        />
        <button
          aria-label="补录完成事项"
          className="rounded-lg bg-stone-800 px-2 py-1.5 text-xs text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-500 disabled:opacity-50 sm:px-2.5"
          disabled={disabled}
          type="submit"
        >
          补录
        </button>
      </div>
      {error ? (
        <p className="mt-1 px-2 text-xs text-red-700" id="historical-error">
          {error}
        </p>
      ) : null}
    </form>
  );
}
