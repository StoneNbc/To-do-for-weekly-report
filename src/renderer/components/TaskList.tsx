import type { AddedDateDisplay, TodayTaskView } from '../../shared/domain';
import { TaskItem } from './TaskItem';

/** 今日未完成任务列表；key 使用 locator，正文重复时仍保持独立组件身份。 */
export function TaskList({
  tasks,
  disabled,
  onToggle,
  onEdit,
  onDelete,
  addedDateDisplay = 'hover',
}: {
  tasks: TodayTaskView[];
  disabled?: boolean | undefined;
  onToggle: (locator: TodayTaskView['locator']) => void;
  onEdit: (task: TodayTaskView, content: string) => Promise<boolean> | boolean;
  onDelete: (locator: TodayTaskView['locator']) => void;
  addedDateDisplay?: AddedDateDisplay;
}) {
  if (tasks.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-amber-900/15 px-3 py-5 text-center text-sm text-stone-500">
        没有待完成事项
      </p>
    );
  }

  return (
    <ul aria-label="待完成事项" className="space-y-1">
      {tasks.map((task) => (
        <TaskItem
          completed={false}
          addedDate={task.addedDate}
          addedDateDisplay={addedDateDisplay}
          content={task.content}
          disabled={disabled}
          key={`${task.locator.revision}:${task.locator.line}`}
          locator={task.locator}
          onDelete={onDelete}
          onEdit={(_, content) => onEdit(task, content)}
          onToggle={onToggle}
        />
      ))}
    </ul>
  );
}
