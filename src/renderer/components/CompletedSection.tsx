import type { AddedDateDisplay, TodayTaskView } from '../../shared/domain';
import { ChevronIcon } from './ChevronIcon';
import { TaskItem } from './TaskItem';

const COLLAPSED_LIMIT = 3;

/** 已完成任务默认只展示前三项，展开只影响会话 UI，不改变数据文件。 */
export function CompletedSection({
  tasks,
  expanded,
  disabled,
  onToggleExpanded,
  onToggle,
  onEdit,
  onDelete,
  addedDateDisplay = 'hover',
  activeEditingKey,
  onEditingChange,
}: {
  tasks: TodayTaskView[];
  expanded: boolean;
  disabled?: boolean | undefined;
  onToggleExpanded: () => void;
  onToggle: (locator: TodayTaskView['locator']) => void;
  onEdit: (task: TodayTaskView, content: string, details: string) => Promise<boolean> | boolean;
  onDelete: (locator: TodayTaskView['locator']) => void;
  addedDateDisplay?: AddedDateDisplay;
  activeEditingKey?: string | null;
  onEditingChange?: (taskKey: string | null) => void;
}) {
  const visibleTasks = expanded ? tasks : tasks.slice(0, COLLAPSED_LIMIT);

  return (
    <section aria-labelledby="completed-heading" className="mt-3 border-t border-amber-900/10 pt-2">
      <button
        aria-expanded={expanded}
        className="no-drag flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs font-medium text-stone-500 hover:bg-white/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"
        onClick={onToggleExpanded}
        type="button"
      >
        <span id="completed-heading">已完成（{tasks.length}）</span>
        <ChevronIcon expanded={expanded} />
      </button>
      {tasks.length === 0 ? (
        <p className="px-2 py-2 text-xs text-stone-400">今天还没有已完成事项</p>
      ) : (
        <ul aria-label="今日已完成" className="mt-1 space-y-1">
          {visibleTasks.map((task) => (
            <TaskItem
              completed
              activeEditingKey={activeEditingKey}
              addedDate={task.addedDate}
              addedDateDisplay={addedDateDisplay}
              completedAt={task.completedAt}
              content={task.content}
              details={task.details}
              disabled={disabled}
              key={`${task.locator.revision}:${task.locator.line}`}
              locator={task.locator}
              onDelete={onDelete}
              onEditingChange={onEditingChange}
              onEdit={(_, content, details) => onEdit(task, content, details)}
              onToggle={onToggle}
            />
          ))}
        </ul>
      )}
      {!expanded && tasks.length > COLLAPSED_LIMIT ? (
        <p className="px-2 pt-1 text-[11px] text-stone-400">
          另有 {tasks.length - COLLAPSED_LIMIT} 项已折叠
        </p>
      ) : null}
    </section>
  );
}
