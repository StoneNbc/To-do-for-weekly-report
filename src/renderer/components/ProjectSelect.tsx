import type { ProjectFilter, ProjectView } from '../../shared/projects';

const projectFilterValue = (filter: ProjectFilter): string =>
  filter.kind === 'all'
    ? 'all'
    : filter.kind === 'unclassified'
      ? 'none'
      : JSON.stringify(filter.names);
const projectFilterFromValue = (value: string): ProjectFilter =>
  value === 'all'
    ? { kind: 'all' }
    : value === 'none'
      ? { kind: 'unclassified' }
      : { kind: 'names', names: JSON.parse(value) as string[] };

export function ProjectSelect({
  projects,
  value,
  onChange,
  label = '选择项目',
  allowAll = true,
  includeArchived = false,
  disabled = false,
}: {
  projects: ProjectView[];
  value: ProjectFilter;
  onChange: (value: ProjectFilter) => void;
  label?: string;
  allowAll?: boolean;
  includeArchived?: boolean;
  disabled?: boolean;
}) {
  const visible = projects.filter(
    (project) =>
      includeArchived ||
      project.status === 'active' ||
      (project.pendingCount ?? 0) > 0 ||
      (value.kind === 'names' && value.names.includes(project.name)),
  );
  return (
    <select
      aria-label={label}
      className="project-select no-drag min-w-0 max-w-full"
      disabled={disabled}
      onChange={(event) => onChange(projectFilterFromValue(event.target.value))}
      value={projectFilterValue(value)}
    >
      {allowAll && <option value="all">全部项目</option>}
      <option value="none">未分类</option>
      {visible.map((project) => (
        <option key={project.name} value={JSON.stringify([project.name])}>
          {project.name}
          {project.unregistered ? '（未登记）' : project.status === 'archived' ? '（已归档）' : ''}
          {project.pendingCount !== undefined ? ` · ${project.pendingCount}` : ''}
        </option>
      ))}
    </select>
  );
}
