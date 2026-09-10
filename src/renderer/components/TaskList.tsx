import { ProjectTaskGroups } from './ProjectTaskGroups';
import type { ProjectView } from '../../shared/projects';
import type { AddedDateDisplay, TodayTaskView } from '../../shared/domain';
import { TaskItem } from './TaskItem';

/** 今日未完成任务列表；key 使用 locator，正文重复时仍保持独立组件身份。 */
export function TaskList({
  tasks,
  projects,
  groupByProject,
  selectedLines,
  onSelect,
  onAddToProject,
  disabled,
  onToggle,
  onEdit,
  onDelete,
  addedDateDisplay = 'hover',
  activeEditingKey,
  onEditingChange,
}: {
  tasks: TodayTaskView[];
  projects?: ProjectView[] | undefined;
  groupByProject?: boolean | undefined;
  selectedLines?: number[] | undefined;
  onSelect?: ((line: number) => void) | undefined;
  onAddToProject?: ((name: string | null) => void) | undefined;
  disabled?: boolean | undefined;
  onToggle: (locator: TodayTaskView['locator']) => void;
  onEdit: (
    task: TodayTaskView,
    content: string,
    details: string,
    projectName?: string | null,
  ) => Promise<boolean> | boolean;
  onDelete: (locator: TodayTaskView['locator']) => void;
  addedDateDisplay?: AddedDateDisplay;
  activeEditingKey?: string | null;
  onEditingChange?: (taskKey: string | null) => void;
}) {
  const hasEmptyProjects =
    groupByProject &&
    projects?.some((project) => project.status === 'active' && !project.unregistered);
  if (tasks.length === 0 && !hasEmptyProjects) {
    return (
      <p className="rounded-xl border border-dashed border-amber-900/15 px-3 py-5 text-center text-sm text-stone-500">
        没有待完成事项
      </p>
    );
  }

  return (
    <ul aria-label="待完成事项" className="space-y-1">
      <ProjectTaskGroups
        tasks={tasks}
        projects={projects}
        group={groupByProject}
        showEmptyProjects
        onAddToProject={onAddToProject}
        addDisabled={disabled || activeEditingKey != null}
        render={(task) => (
          <TaskItem
            completed={false}
            selected={selectedLines?.includes(task.locator.line)}
            onSelect={() => onSelect?.(task.locator.line)}
            activeEditingKey={activeEditingKey}
            addedDate={task.addedDate}
            addedDateDisplay={addedDateDisplay}
            projectName={task.projectName}
            projects={projects}
            content={task.content}
            details={task.details}
            disabled={disabled}
            key={`${task.locator.revision}:${task.locator.line}`}
            locator={task.locator}
            onDelete={onDelete}
            onEditingChange={onEditingChange}
            onEdit={(_, content, details, _time, projectName) =>
              onEdit(task, content, details, projectName)
            }
            onToggle={onToggle}
          />
        )}
      />
    </ul>
  );
}
