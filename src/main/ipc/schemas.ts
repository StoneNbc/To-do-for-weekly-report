import { z } from 'zod';
import {
  isValidNoteColor,
  isValidNoteOpacity,
  normalizeNoteColor,
} from '../../shared/noteAppearance';
import { llmConnectionSettingsSchema } from '../services/configService';

// IPC 是安全边界：即使 Renderer 有 TypeScript 类型，Main 仍要验证运行时输入。
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const localTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const contentSchema = z
  .string()
  .trim()
  .min(1)
  .max(2_000)
  .refine((value) => !/[\r\n]/.test(value));
export const revisionSchema = z.string().min(1).max(128);
export const taskLocatorSchema = z.object({
  line: z.number().int().nonnegative(),
  revision: revisionSchema,
});
export const isoWeekInputSchema = z.object({
  isoYear: z.number().int().min(1900).max(9999),
  isoWeek: z.number().int().min(1).max(53),
});

export const reportGenerationInputSchema = isoWeekInputSchema.extend({
  requestId: z.string().uuid(),
});

export const reportDraftSaveSchema = z.object({
  draftId: z.string().uuid(),
  content: z.string().min(1).max(1_000_000),
});

export const reportSettingsPatchSchema = z.object({
  mode: z.enum(['local-template', 'remote-llm']),
  recordTemplate: z.string().min(1).max(20_000),
  remoteTemplate: z.string().min(1).max(20_000),
  prompt: z.string().min(1).max(20_000),
  llm: llmConnectionSettingsSchema,
  apiKey: z.string().max(8_192).optional(),
});

export const llmConnectionTestInputSchema = z
  .object({
    llm: llmConnectionSettingsSchema,
    apiKey: z.string().max(8_192).optional(),
  })
  .strict();

export const reportTextKindSchema = z.enum(['record-template', 'remote-template', 'prompt']);

export const noteColorSchema = z
  .string()
  .transform(normalizeNoteColor)
  .refine(isValidNoteColor, { message: '便利贴颜色必须是六位十六进制色值' });
export const noteOpacitySchema = z.number().refine(isValidNoteOpacity, {
  message: '便利贴不透明度必须在 60% 到 100% 之间，并以 5% 为步进',
});

export const appearancePreviewSchema = z
  .object({
    noteColor: noteColorSchema.optional(),
    noteOpacity: noteOpacitySchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: '预览内容不能为空' });

export const settingsPatchSchema = appearancePreviewSchema
  .safeExtend({
    alwaysOnTop: z.boolean().optional(),
    completedExpanded: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: '设置修改不能为空' });
