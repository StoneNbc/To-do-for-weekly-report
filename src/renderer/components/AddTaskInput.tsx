import { useEffect, useRef, useState, type FormEvent } from 'react';

/** 今日任务输入；只有 Main 确认保存成功后才清空草稿。 */
export function AddTaskInput({
  disabled = false,
  placeholder = '添加待办…',
  focusSignal = 0,
  onAdd,
}: {
  disabled?: boolean;
  placeholder?: string;
  focusSignal?: number;
  onAdd: (content: string) => Promise<boolean> | boolean;
}) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (focusSignal > 0) inputRef.current?.focus();
  }, [focusSignal]);
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
    <form className="task-composer-form no-drag" onSubmit={(event) => void submit(event)}>
      <div className="task-composer-field flex items-center gap-2">
        <input
          ref={inputRef}
          aria-describedby={error ? 'add-task-error' : undefined}
          aria-label="添加待办"
          className="min-w-0 flex-1 bg-transparent px-1 py-1.5 text-sm outline-none placeholder:text-stone-400"
          disabled={disabled}
          onChange={(event) => setValue(event.target.value)}
          placeholder={placeholder}
          value={value}
        />
        <button
          aria-label="添加任务"
          className="composer-submit rounded-lg px-3 py-1.5 text-xs font-medium"
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
