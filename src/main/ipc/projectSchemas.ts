import { z } from 'zod';
import { normalizeProjectName } from '../../shared/projects';
export const projectNameSchema = z
  .string()
  .max(400)
  .transform((value, ctx) => {
    try {
      return normalizeProjectName(value);
    } catch {
      ctx.addIssue({ code: 'custom', message: '项目名称无效' });
      return z.NEVER;
    }
  });
export const projectFilterSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('all') }),
  z.object({ kind: z.literal('unclassified') }),
  z.object({ kind: z.literal('names'), names: z.array(projectNameSchema).min(1).max(1000) }),
]);
