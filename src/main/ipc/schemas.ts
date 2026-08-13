import { z } from 'zod';

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const localTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const contentSchema = z.string().trim().min(1).max(2_000).refine((value) => !/[\r\n]/.test(value));
export const revisionSchema = z.string().min(1).max(128);
export const taskLocatorSchema = z.object({
  line: z.number().int().nonnegative(),
  revision: revisionSchema,
});
export const isoWeekInputSchema = z.object({
  isoYear: z.number().int().min(1900).max(9999),
  isoWeek: z.number().int().min(1).max(53),
});
