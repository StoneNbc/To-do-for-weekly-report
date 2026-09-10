import type { FileRevision, ParseWarning, TaskLocator } from './domain';

export type ProjectStatus = 'active' | 'archived';
export type ProjectFilter =
  { kind: 'all' } | { kind: 'unclassified' } | { kind: 'names'; names: string[] };

export interface ProjectView {
  name: string;
  status: ProjectStatus;
  color?: string;
  pendingCount?: number;
  unregistered?: boolean;
}

export interface ProjectRecovery {
  blocked: boolean;
  message: string;
  files: string[];
}

export interface ProjectSnapshot {
  revision: FileRevision;
  projects: ProjectView[];
  warnings: ParseWarning[];
  recovery: ProjectRecovery;
}

export interface ProjectRenamePlan {
  token: string;
  oldName: string;
  newName: string;
  fileCount: number;
  taskCount: number;
}

export interface ProjectMutation {
  name: string;
  expectedRevision: FileRevision;
}

export interface MoveTasksInput {
  locators: TaskLocator[];
  projectName: string | null;
}

export interface ProjectReportOptions {
  projectFilter?: ProjectFilter | undefined;
  groupBy?: 'date' | 'project' | undefined;
  includePendingCandidates?: boolean | undefined;
  previewToken?: string | undefined;
}

export interface PendingReportTask {
  content: string;
  projectName?: string | null;
}

export interface ReportSourcePreview {
  token: string;
  text: string;
  taskCount: number;
  pendingCount: number;
}

export const normalizeProjectName = (value: string): string => {
  const name = value.trim();
  if (!name || [...name].length > 80 || /[\p{Cc}\p{Zl}\p{Zp}]/u.test(name)) {
    throw new RangeError('项目名称须为 1–80 个字符，不能包含换行或控制字符');
  }
  if (name === '全部项目' || name === '未分类') throw new RangeError('该名称为系统保留名称');
  return name;
};

export const matchesProject = (
  projectName: string | null | undefined,
  filter: ProjectFilter = { kind: 'all' },
): boolean =>
  filter.kind === 'all' ||
  (filter.kind === 'unclassified'
    ? !projectName
    : projectName != null && filter.names.includes(projectName));
