import type { ElectronAPI } from '../../preload/apiTypes';
import type { DayRecordSnapshot, TodaySnapshot } from '../../shared/domain';
import type { ProjectRenamePlan, ProjectSnapshot } from '../../shared/projects';
import { normalizeProjectName } from '../../shared/projects';
import { failure, ok } from '../../shared/results';

export const createMockProjectAPI = (source: {
  today: () => TodaySnapshot;
  history: () => DayRecordSnapshot;
  setToday: (value: TodaySnapshot) => void;
  setHistory: (value: DayRecordSnapshot) => void;
  changed: () => void;
}): ElectronAPI['projects'] => {
  let snapshot: ProjectSnapshot = {
    revision: 'projects-0',
    projects: [],
    warnings: [],
    recovery: { blocked: false, message: '', files: [] },
  };
  let plan: ProjectRenamePlan | null = null;
  const view = () => ({
    ...structuredClone(snapshot),
    projects: snapshot.projects.map((project) => ({
      ...project,
      pendingCount: source
        .today()
        .tasks.filter((task) => !task.completed && task.projectName === project.name).length,
    })),
  });
  const valid = (revision: string) => snapshot.revision === revision;
  const done = () => {
    snapshot = { ...snapshot, revision: crypto.randomUUID() };
    source.changed();
    return ok(view());
  };
  return {
    get: async () => ok(view()),
    create: async (input) => {
      if (!valid(input.expectedRevision)) return failure('FILE_CHANGED', '项目目录已更新');
      let name: string;
      try {
        name = normalizeProjectName(input.name);
      } catch {
        return failure('INVALID_INPUT', '项目名称无效');
      }
      if (snapshot.projects.some((project) => project.name === name))
        return failure('PROJECT_NAME_EXISTS', '项目名称已存在');
      snapshot.projects.push({
        name,
        status: 'active',
        ...(input.color ? { color: input.color } : {}),
      });
      return done();
    },
    update: async (input) => {
      if (!valid(input.expectedRevision)) return failure('FILE_CHANGED', '项目目录已更新');
      const project = snapshot.projects.find((project) => project.name === input.name);
      if (!project) return failure('PROJECT_NOT_FOUND', '项目不存在');
      if (
        input.status === 'archived' &&
        source.today().tasks.some((task) => task.projectName === input.name && !task.completed)
      )
        return failure('PROJECT_HAS_PENDING', '请先完成或移出待办');
      if (input.status) project.status = input.status;
      if (input.color) project.color = input.color;
      else if (input.color === null) delete project.color;
      return done();
    },
    reorder: async (input) => {
      if (!valid(input.expectedRevision)) return failure('FILE_CHANGED', '项目目录已更新');
      if (
        input.names.length !== snapshot.projects.length ||
        new Set(input.names).size !== input.names.length ||
        input.names.some((name) => !snapshot.projects.some((project) => project.name === name))
      )
        return failure('INVALID_INPUT', '项目顺序无效');
      snapshot.projects = input.names.map((name) =>
        snapshot.projects.find((project) => project.name === name)!,
      );
      return done();
    },
    deleteEmpty: async (input) => {
      if (!valid(input.expectedRevision)) return failure('FILE_CHANGED', '项目目录已更新');
      if (
        [...source.today().tasks, ...source.history().tasks].some(
          (task) => task.projectName === input.name,
        )
      )
        return failure('PROJECT_IN_USE', '项目仍被任务引用');
      snapshot.projects = snapshot.projects.filter((project) => project.name !== input.name);
      return done();
    },
    previewRename: async (input) => {
      if (!valid(input.expectedRevision)) return failure('FILE_CHANGED', '项目目录已更新');
      if (
        input.newName !== input.oldName &&
        snapshot.projects.some((project) => project.name === input.newName)
      )
        return failure('PROJECT_NAME_EXISTS', '项目名称已存在');
      plan = {
        token: crypto.randomUUID(),
        oldName: input.oldName,
        newName: input.newName,
        fileCount: 2,
        taskCount: [...source.today().tasks, ...source.history().tasks].filter(
          (task) => task.projectName === input.oldName,
        ).length,
      };
      return ok(plan);
    },
    rename: async (token) => {
      if (!plan || plan.token !== token) return failure('FILE_CHANGED', '改名预览已过期');
      const { oldName, newName } = plan;
      plan = null;
      snapshot.projects = snapshot.projects.map((project) =>
        project.name === oldName ? { ...project, name: newName } : project,
      );
      source.setToday({
        ...source.today(),
        tasks: source
          .today()
          .tasks.map((task) =>
            task.projectName === oldName ? { ...task, projectName: newName } : task,
          ),
      });
      source.setHistory({
        ...source.history(),
        tasks: source
          .history()
          .tasks.map((task) =>
            task.projectName === oldName ? { ...task, projectName: newName } : task,
          ),
      });
      return done();
    },
    retryRecovery: async () => ok(view()),
    openRecoveryFolder: async () => ok(undefined),
  };
};
