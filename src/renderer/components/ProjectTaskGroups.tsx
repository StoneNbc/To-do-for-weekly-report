import { useState, type ReactNode } from 'react';
import type { ProjectView } from '../../shared/projects';

/** Grouping is a view only: retain source order and keep each physical task distinct. */
export function ProjectTaskGroups<T extends { projectName?: string | null }>({
  tasks,
  projects,
  group,
  showEmptyProjects = false,
  onAddToProject,
  addDisabled,
  render,
}: {
  tasks: T[];
  projects?: ProjectView[] | undefined;
  group?: boolean | undefined;
  showEmptyProjects?: boolean | undefined;
  onAddToProject?: ((name: string | null) => void) | undefined;
  addDisabled?: boolean | undefined;
  render: (task: T) => ReactNode;
}) {
  const [collapsed, setCollapsed] = useState<string[]>([]);
  if (!group) return <>{tasks.map(render)}</>;
  const names = [
    ...new Set([
      ...(projects ?? []).map((project) => project.name),
      ...tasks.map((task) => task.projectName ?? ''),
    ]),
  ].filter(
    (name) =>
      tasks.some((task) => (task.projectName ?? '') === name) ||
      (showEmptyProjects &&
        projects?.some(
          (project) =>
            project.name === name && project.status === 'active' && !project.unregistered,
        )),
  );
  names.sort((a, b) => (a === '' ? 1 : b === '' ? -1 : 0));
  return (
    <>
      {names.map((name) => {
        const project = projects?.find((project) => project.name === name);
        const items = tasks.filter((task) => (task.projectName ?? '') === name);
        const canAdd = name === '' || (project?.status === 'active' && !project.unregistered);
        return (
          <li key={JSON.stringify(name)} className="project-group list-none">
            <div className="project-group-heading flex min-w-0 items-center gap-1">
              <button
                type="button"
                className="project-group-toggle flex min-w-0 flex-1 items-center gap-2 text-left text-xs"
                aria-expanded={!collapsed.includes(name)}
                onClick={() =>
                  setCollapsed((values) =>
                    values.includes(name)
                      ? values.filter((value) => value !== name)
                      : [...values, name],
                  )
                }
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 16 16"
                  className={`project-chevron h-3 w-3 shrink-0 ${collapsed.includes(name) ? '-rotate-90' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                >
                  <path d="m4 6 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: project?.color ?? '#A8A29E' }}
                />
                <span className="project-name min-w-0 flex-1 truncate" title={name || '未分类'}>
                  {name || '未分类'}
                  {project?.status === 'archived'
                    ? ' · 已归档'
                    : project?.unregistered
                      ? ' · 未登记'
                      : ''}
                </span>
                <span className="project-count">（{items.length}）</span>
              </button>
              {onAddToProject && canAdd && (
                <button
                  type="button"
                  aria-label={`添加待办到：${name || '未分类'}`}
                  title={`添加待办到「${name || '未分类'}」`}
                  disabled={addDisabled}
                  onClick={() => onAddToProject(name || null)}
                  className="project-add no-drag grid h-7 w-7 shrink-0 place-items-center"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 16 16"
                    className="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                  >
                    <path d="M8 3v10M3 8h10" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </div>
            {!collapsed.includes(name) && items.length > 0 && (
              <ul className="project-group-tasks space-y-1">{items.map(render)}</ul>
            )}
          </li>
        );
      })}
    </>
  );
}
