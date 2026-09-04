import { useId, useRef, useState, type KeyboardEvent } from 'react';
import type { AddedDateDisplay, TaskLocator } from '../../shared/domain';
import { ChevronIcon } from './ChevronIcon';

export interface TaskItemProps {
  locator: TaskLocator;
  content: string;
  details: string;
  completed: boolean;
  completedAt?: string | undefined;
  addedDate?: string | undefined;
  addedDateDisplay?: AddedDateDisplay | undefined;
  editableTime?: boolean;
  readOnlyCompletion?: boolean;
  disabled?: boolean | undefined;
  activeEditingKey?: string | null | undefined;
  onEditingChange?: ((taskKey: string | null) => void) | undefined;
  onToggle?: (locator: TaskLocator) => void;
  onEdit: (
    locator: TaskLocator,
    content: string,
    details: string,
    completedAt?: string,
  ) => Promise<boolean> | boolean;
  onDelete: (locator: TaskLocator) => void;
}

/**
 * 单条任务的展示与编辑组件。
 * 支持完成/撤销、双击或 F2 编辑标题与多行详情、可选编辑完成时间、展开/收起详情、
 * 以及删除。编辑提交通过 onEdit 回调交给上层，只有保存成功才退出编辑态。
 */
export function TaskItem({
  locator,
  content,
  details,
  completed,
  completedAt,
  addedDate,
  addedDateDisplay = 'hover',
  editableTime = false,
  readOnlyCompletion = false,
  disabled = false,
  activeEditingKey,
  onEditingChange,
  onToggle,
  onEdit,
  onDelete,
}: TaskItemProps) {
  const [localEditing, setLocalEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState(content);
  const [detailsDraft, setDetailsDraft] = useState(details);
  const [timeDraft, setTimeDraft] = useState(completedAt ?? '');
  const [validationError, setValidationError] = useState<string | null>(null);
  const committingRef = useRef(false);
  const detailsId = useId();
  const taskKey = `${locator.revision}:${locator.line}`;
  const editing = activeEditingKey === undefined ? localEditing : activeEditingKey === taskKey;
  const hasDetails = details.trim().length > 0;

  const setEditing = (value: boolean) => {
    if (activeEditingKey === undefined) setLocalEditing(value);
    onEditingChange?.(value ? taskKey : null);
  };

  const startEditing = () => {
    if (disabled) return;
    setDraft(content);
    setDetailsDraft(details);
    setTimeDraft(completedAt ?? '');
    setValidationError(null);
    setEditing(true);
  };

  const cancel = () => {
    setDraft(content);
    setDetailsDraft(details);
    setTimeDraft(completedAt ?? '');
    setValidationError(null);
    setEditing(false);
  };

  const commit = async () => {
    if (committingRef.current) return;
    const normalized = draft.trim();
    if (!normalized) {
      setValidationError('任务标题不能为空');
      return;
    }
    const normalizedDetails = detailsDraft.replace(/\r\n?/g, '\n');
    const timeChanged = editableTime && timeDraft !== (completedAt ?? '');
    if (normalized === content && normalizedDetails === details && !timeChanged) {
      setEditing(false);
      return;
    }
    setValidationError(null);
    committingRef.current = true;
    try {
      const saved = await onEdit(
        locator,
        normalized,
        normalizedDetails,
        editableTime ? timeDraft || undefined : completedAt,
      );
      if (saved) setEditing(false);
    } finally {
      committingRef.current = false;
    }
  };

  const handleTitleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      void commit();
    }
  };

  const handleDetailsKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
    } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void commit();
    }
  };

  return (
    <li className="task-row no-drag group relative flex min-h-10 flex-col rounded-xl px-2 py-1.5 hover:bg-white/45 focus-within:bg-white/55">
      <div className={`flex w-full gap-2 ${editing ? 'items-start' : 'items-center'}`}>
        {readOnlyCompletion ? (
          <span
            className={`grid h-5 w-5 shrink-0 place-items-center text-emerald-700 ${editing ? 'mt-7' : ''}`}
            aria-hidden="true"
          >
            ✓
          </span>
        ) : (
          <input
            aria-label={`${completed ? '撤销完成' : '完成任务'}：${content}`}
            checked={completed}
            className={`h-4 w-4 shrink-0 accent-amber-700 ${editing ? 'mt-7' : ''}`}
            disabled={disabled}
            onChange={() => onToggle?.(locator)}
            type="checkbox"
          />
        )}

        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="flex flex-col gap-2 py-1">
              <label className="text-[11px] font-medium text-stone-500">
                标题
                <input
                  aria-label={`编辑任务：${content}`}
                  autoFocus
                  className="mt-1 w-full rounded-md border border-amber-500 bg-white/80 px-2 py-1.5 text-sm outline-none ring-2 ring-amber-300"
                  disabled={disabled}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={handleTitleKeyDown}
                  value={draft}
                />
              </label>
              <label className="text-[11px] font-medium text-stone-500">
                详细说明
                <textarea
                  aria-label={`编辑任务详情：${content}`}
                  className="mt-1 min-h-24 max-h-52 w-full resize-y rounded-md border border-amber-500 bg-white/80 px-2 py-1.5 text-sm leading-5 outline-none ring-2 ring-amber-300"
                  disabled={disabled}
                  onChange={(event) => setDetailsDraft(event.target.value)}
                  onKeyDown={handleDetailsKeyDown}
                  placeholder="补充背景、步骤或注意事项"
                  value={detailsDraft}
                />
              </label>
              {editableTime ? (
                <label className="text-[11px] font-medium text-stone-500">
                  完成时间
                  <input
                    aria-label={`编辑完成时间：${content}`}
                    className="mt-1 w-[6.5rem] rounded-md border border-amber-500 bg-white/80 px-2 py-1 text-xs outline-none ring-2 ring-amber-300"
                    disabled={disabled}
                    onChange={(event) => setTimeDraft(event.target.value)}
                    onKeyDown={handleTitleKeyDown}
                    type="time"
                    value={timeDraft}
                  />
                </label>
              ) : null}
              {validationError ? (
                <p className="text-xs text-red-700" role="alert">
                  {validationError}
                </p>
              ) : null}
              <div className="flex justify-end gap-2">
                <button
                  className="rounded-md px-2.5 py-1 text-xs text-stone-600 hover:bg-white/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"
                  disabled={disabled}
                  onClick={cancel}
                  type="button"
                >
                  取消
                </button>
                <button
                  className="rounded-md bg-amber-700 px-2.5 py-1 text-xs text-white hover:bg-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"
                  disabled={disabled}
                  onClick={() => void commit()}
                  title="Command/Ctrl + Enter"
                  type="button"
                >
                  保存
                </button>
              </div>
            </div>
          ) : (
            <span
              aria-label={`任务内容：${content}`}
              className={`block w-full truncate rounded text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-amber-600 ${
                completed ? 'text-stone-500 line-through decoration-stone-400' : 'text-stone-800'
              }`}
              onDoubleClick={startEditing}
              onKeyDown={(event) => {
                if (!disabled && (event.key === 'Enter' || event.key === 'F2')) startEditing();
              }}
              role="button"
              tabIndex={disabled ? -1 : 0}
              title="双击或按 F2 编辑"
            >
              {content}
            </span>
          )}
        </div>

        {!editing && completedAt ? (
          <time className="shrink-0 text-[11px] tabular-nums text-stone-400">{completedAt}</time>
        ) : null}
        {!editing ? (
          <span
            className={`added-date shrink-0 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[10px] tabular-nums ${
              addedDateDisplay === 'always'
                ? ''
                : 'invisible group-hover:visible group-focus-within:visible'
            }`}
            title={addedDate ? `添加日期：${addedDate}` : '添加日期未知'}
          >
            {addedDate ? `添加 ${addedDate.slice(5)}` : '添加日期未知'}
          </span>
        ) : null}
        {!editing && hasDetails ? (
          <button
            aria-controls={detailsId}
            aria-expanded={expanded}
            aria-label={`${expanded ? '收起' : '展开'}任务详情：${content}`}
            className="rounded-md px-1.5 py-1 text-xs text-stone-500 outline-none hover:bg-white/60 hover:text-stone-800 focus-visible:ring-2 focus-visible:ring-amber-600"
            disabled={disabled}
            onClick={() => setExpanded((value) => !value)}
            title={expanded ? '收起详情' : '展开详情'}
            type="button"
          >
            <ChevronIcon expanded={expanded} />
          </button>
        ) : null}
        {!editing ? (
          <button
            aria-label={`删除任务：${content}`}
            className="delete-task rounded-md px-1.5 py-1 text-stone-400 opacity-0 outline-none hover:bg-red-50 hover:text-red-700 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-red-500 group-hover:opacity-100"
            disabled={disabled}
            onClick={() => onDelete(locator)}
            type="button"
          >
            ×
          </button>
        ) : null}
      </div>

      {!editing && hasDetails && expanded ? (
        <div
          aria-label={`任务详情：${content}`}
          className="ml-7 mt-1 whitespace-pre-wrap break-words border-l border-amber-900/15 pl-3 pr-2 text-xs leading-5 text-stone-600"
          id={detailsId}
          role="region"
        >
          {details}
        </div>
      ) : null}
    </li>
  );
}
