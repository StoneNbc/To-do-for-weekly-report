import { useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import type { TaskLocator } from '../../shared/domain';

export interface TaskItemProps {
  locator: TaskLocator;
  content: string;
  completed: boolean;
  completedAt?: string | undefined;
  editableTime?: boolean;
  readOnlyCompletion?: boolean;
  disabled?: boolean | undefined;
  onToggle?: (locator: TaskLocator) => void;
  onEdit: (
    locator: TaskLocator,
    content: string,
    completedAt?: string,
  ) => Promise<boolean> | boolean;
  onDelete: (locator: TaskLocator) => void;
}

export function TaskItem({
  locator,
  content,
  completed,
  completedAt,
  editableTime = false,
  readOnlyCompletion = false,
  disabled = false,
  onToggle,
  onEdit,
  onDelete,
}: TaskItemProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content);
  const [timeDraft, setTimeDraft] = useState(completedAt ?? '');
  const committingRef = useRef(false);
  const cancelledRef = useRef(false);

  const cancel = () => {
    cancelledRef.current = true;
    setDraft(content);
    setTimeDraft(completedAt ?? '');
    setEditing(false);
  };

  const commit = async () => {
    // blur 和 Enter 可能在同一交互中连续触发，ref 防止重复发起 IPC mutation。
    if (cancelledRef.current || committingRef.current) return;
    const normalized = draft.trim();
    const timeChanged = editableTime && timeDraft !== (completedAt ?? '');
    if (!normalized || (normalized === content && !timeChanged)) {
      setDraft(content);
      setEditing(false);
      return;
    }
    committingRef.current = true;
    const saved = await onEdit(
      locator,
      normalized,
      editableTime ? timeDraft || undefined : completedAt,
    );
    committingRef.current = false;
    if (saved) setEditing(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      void commit();
    }
  };

  const handleEditBlur = (event: FocusEvent<HTMLDivElement>) => {
    // 正文和时间是一个编辑组；焦点在组内移动时不能提前提交。
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))
      return;
    void commit();
  };

  return (
    <li className="task-row no-drag group flex min-h-10 items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-white/45 focus-within:bg-white/55">
      {readOnlyCompletion ? (
        <span
          className="grid h-5 w-5 shrink-0 place-items-center text-emerald-700"
          aria-hidden="true"
        >
          ✓
        </span>
      ) : (
        <input
          aria-label={`${completed ? '撤销完成' : '完成任务'}：${content}`}
          checked={completed}
          className="h-4 w-4 shrink-0 accent-amber-700"
          disabled={disabled}
          onChange={() => onToggle?.(locator)}
          type="checkbox"
        />
      )}

      <div className="min-w-0 flex-1">
        {editing ? (
          <div className="flex items-center gap-1" onBlur={handleEditBlur}>
            <input
              aria-label={`编辑任务：${content}`}
              autoFocus
              className="min-w-0 flex-1 rounded-md border border-amber-500 bg-white/80 px-2 py-1 text-sm outline-none ring-2 ring-amber-300"
              disabled={disabled}
              onChange={(event) => setDraft(event.target.value)}
              onFocus={() => {
                cancelledRef.current = false;
              }}
              onKeyDown={handleKeyDown}
              value={draft}
            />
            {editableTime ? (
              <input
                aria-label={`编辑完成时间：${content}`}
                className="w-[5.2rem] rounded-md border border-amber-500 bg-white/80 px-1 py-1 text-xs outline-none ring-2 ring-amber-300"
                disabled={disabled}
                onBlur={() => void commit()}
                onChange={(event) => setTimeDraft(event.target.value)}
                onFocus={() => {
                  cancelledRef.current = false;
                }}
                onKeyDown={handleKeyDown}
                type="time"
                value={timeDraft}
              />
            ) : null}
          </div>
        ) : (
          // 使用带键盘语义的 span，避免与同一行的删除 button 形成嵌套按钮。
          <span
            aria-label={`任务内容：${content}`}
            className={`block w-full truncate rounded text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-amber-600 ${
              completed ? 'text-stone-500 line-through decoration-stone-400' : 'text-stone-800'
            }`}
            onDoubleClick={() => {
              if (!disabled) setEditing(true);
            }}
            onKeyDown={(event) => {
              if (!disabled && (event.key === 'Enter' || event.key === 'F2')) setEditing(true);
            }}
            role="button"
            tabIndex={disabled ? -1 : 0}
            title="双击或按 F2 编辑"
          >
            {content}
          </span>
        )}
      </div>

      {completedAt ? (
        <time className="shrink-0 text-[11px] tabular-nums text-stone-400">{completedAt}</time>
      ) : null}
      <button
        aria-label={`删除任务：${content}`}
        className="delete-task rounded-md px-1.5 py-1 text-stone-400 opacity-0 outline-none hover:bg-red-50 hover:text-red-700 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-red-500 group-hover:opacity-100"
        disabled={disabled}
        onClick={() => onDelete(locator)}
        type="button"
      >
        ×
      </button>
    </li>
  );
}
