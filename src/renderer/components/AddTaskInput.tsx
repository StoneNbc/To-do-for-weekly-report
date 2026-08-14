import { useState, type FormEvent } from 'react';

/** 今日任务输入；只有 Main 确认保存成功后才清空草稿。 */
export function AddTaskInput({
  disabled = false,
  onAdd,
}: {
  disabled?: boolean;
  onAdd: (content: string) => Promise<boolean> | boolean;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const content = value.trim();
    if (!content) {
      setError('请输入任务内容');
      return;
    }
    setError(null);
    if (await onAdd(content)) setValue('');
  };

  return (
    <form
      className="no-drag border-t border-amber-900/10 pt-3"
      onSubmit={(event) => void submit(event)}
    >
      <div className="flex items-center gap-2 rounded-xl bg-white/55 p-1.5 shadow-sm ring-1 ring-amber-900/10 focus-within:ring-2 focus-within:ring-amber-600">
        <span className="pl-1 text-lg text-amber-800" aria-hidden="true">
          +
        </span>
        <input
          aria-describedby={error ? 'add-task-error' : undefined}
          aria-label="添加今日任务"
          className="min-w-0 flex-1 bg-transparent px-1 py-1.5 text-sm outline-none placeholder:text-stone-400"
          disabled={disabled}
          onChange={(event) => setValue(event.target.value)}
          placeholder="添加今日任务…"
          value={value}
        />
        <button
          aria-label="添加任务"
          className="rounded-lg bg-amber-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:opacity-50"
          disabled={disabled}
          type="submit"
        >
          添加
        </button>
      </div>
      {error ? (
        <p className="mt-1 px-2 text-xs text-red-700" id="add-task-error">
          {error}
        </p>
      ) : null}
    </form>
  );
}
