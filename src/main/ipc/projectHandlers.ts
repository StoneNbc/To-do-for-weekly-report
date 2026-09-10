import type { IpcMain } from 'electron';
import { z } from 'zod';
import type { ProjectService } from '../services/projectService';
import type { TaskService } from '../services/taskService';
import type { AppLogger } from '../logging/logger';
import { IPC } from './channels';
import { projectNameSchema, revisionSchema, taskLocatorSchema } from './schemas';
import { toApiError } from './registerHandlers';

export const registerProjectHandlers = (options: {
  ipcMain: Pick<IpcMain, 'handle' | 'removeHandler'>;
  projects: ProjectService;
  task: Pick<TaskService, 'moveMany'>;
  logger: AppLogger;
  broadcast: () => void;
  openRecovery: () => Promise<void>;
  onCreated?: (name: string, senderId: number) => void;
}): (() => void) => {
  const channels: string[] = [];
  const mutation = z.object({ name: projectNameSchema, expectedRevision: revisionSchema });
  const color = z.string().regex(/^#[\da-fA-F]{6}$/);
  const handle = <T>(
    channel: string,
    action: (input: unknown, senderId: number) => Promise<T>,
    changes = true,
  ) => {
    channels.push(channel);
    options.ipcMain.handle(channel, async (_event, input: unknown) => {
      try {
        const data = await action(input, _event.sender.id);
        return { ok: true, data };
      } catch (error) {
        return toApiError(error, options.logger);
      } finally {
        if (changes) options.broadcast();
      }
    });
  };
  handle(IPC.projectsGet, () => options.projects.get(), false);
  handle(IPC.projectsCreate, async (input, senderId) => {
    const parsed = mutation.extend({ color: color.optional() }).strict().parse(input);
    const snapshot = await options.projects.create(parsed);
    options.onCreated?.(parsed.name, senderId);
    return snapshot;
  });
  handle(IPC.projectsUpdate, (input) =>
    options.projects.update(
      mutation
        .extend({
          status: z.enum(['active', 'archived']).optional(),
          color: color.nullable().optional(),
        })
        .strict()
        .parse(input),
    ),
  );
  handle(IPC.projectsReorder, (input) =>
    options.projects.reorder(
      z
        .object({ names: z.array(projectNameSchema).max(1000), expectedRevision: revisionSchema })
        .strict()
        .parse(input),
    ),
  );
  handle(IPC.projectsDeleteEmpty, (input) =>
    options.projects.deleteEmpty(mutation.strict().parse(input)),
  );
  handle(
    IPC.projectsPreviewRename,
    (input) =>
      options.projects.previewRename(
        z
          .object({
            oldName: projectNameSchema,
            newName: projectNameSchema,
            expectedRevision: revisionSchema,
          })
          .strict()
          .parse(input),
      ),
    false,
  );
  handle(IPC.projectsRename, (input) => options.projects.rename(z.string().uuid().parse(input)));
  handle(IPC.projectsRetryRecovery, () => options.projects.retryRecovery());
  handle(IPC.projectsOpenRecoveryFolder, () => options.openRecovery(), false);
  handle(IPC.todayMoveMany, (input) =>
    options.task.moveMany(
      z
        .object({
          locators: z.array(taskLocatorSchema).min(1).max(10000),
          projectName: projectNameSchema.nullable(),
        })
        .strict()
        .parse(input),
    ),
  );
  return () => channels.forEach((channel) => options.ipcMain.removeHandler(channel));
};
