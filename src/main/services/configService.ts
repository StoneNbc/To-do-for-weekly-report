import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { DEFAULT_CONFIG } from '../../shared/constants';
import type { AppConfig, LlmConnectionSettings, WindowBounds } from '../../shared/domain';
import {
  isValidNoteColor,
  isValidNoteOpacity,
  normalizeNoteColor,
} from '../../shared/noteAppearance';
import type { AppLogger } from '../logging/logger';

const windowBoundsSchema = z.object({
  x: z.number().int().finite(),
  y: z.number().int().finite(),
  width: z.number().int().positive().max(20_000),
  height: z.number().int().positive().max(20_000),
});

export const llmConnectionSettingsSchema = z.object({
  provider: z.enum(['deepseek', 'qwen', 'kimi', 'zhipu', 'local', 'custom']),
  baseUrl: z.string().trim().min(1).max(2_048),
  model: z.string().trim().min(1).max(256),
  temperature: z.number().finite().min(0).max(2),
  maxTokens: z.number().int().min(1).max(128_000),
  timeoutMs: z.number().int().min(1_000).max(300_000),
  allowInsecureHttp: z.boolean().default(false),
});

const knownConfigSchema = z.object({
  schema_version: z.literal(2),
  cleanup_time: z.literal('00:00'),
  agent: z.enum(['template', 'openai-compatible']),
  template_path: z.string().max(4_096).nullable(),
  remote_template_path: z.string().max(4_096).nullable(),
  report_prompt_path: z.string().max(4_096).nullable(),
  llm: llmConnectionSettingsSchema,
  remote_consent_confirmed: z.boolean(),
  always_on_top: z.boolean(),
  window_bounds: windowBoundsSchema.nullable(),
  completed_expanded: z.boolean(),
  note_color: z.string().transform(normalizeNoteColor).refine(isValidNoteColor),
  note_opacity: z.number().refine(isValidNoteOpacity),
});

export type ConfigPatch = Partial<
  Pick<
    AppConfig,
    | 'agent'
    | 'template_path'
    | 'remote_template_path'
    | 'report_prompt_path'
    | 'llm'
    | 'remote_consent_confirmed'
    | 'always_on_top'
    | 'window_bounds'
    | 'completed_expanded'
    | 'note_color'
    | 'note_opacity'
  >
>;

export interface ConfigServiceOptions {
  configFile: string;
  logger: AppLogger;
  writeDelayMs?: number;
}

const cloneDefaults = (): AppConfig => structuredClone(DEFAULT_CONFIG) as AppConfig;

/** 按字段回退无效值，同时保留当前版本不认识的扩展字段。 */
export const parseConfig = (input: unknown, onInvalid?: (field: string) => void): AppConfig => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    onInvalid?.('root');
    return cloneDefaults();
  }

  const source = input as Record<string, unknown>;
  const defaults = cloneDefaults();
  const candidate: Record<string, unknown> = { ...source };

  // v1 配置可直接迁移；新增字段按 v2 默认值补齐，写回后完成升级。
  if (source.schema_version === 1) {
    candidate.schema_version = 2;
    onInvalid?.('schema_version');
  }

  for (const key of Object.keys(DEFAULT_CONFIG) as Array<keyof typeof DEFAULT_CONFIG>) {
    const fieldSchema = knownConfigSchema.shape[key];
    const value = key === 'schema_version' && source.schema_version === 1 ? 2 : source[key];
    const result = fieldSchema.safeParse(value);
    if (result.success) {
      candidate[key] = result.data;
      if (
        key === 'llm' &&
        source.llm &&
        typeof source.llm === 'object' &&
        !Array.isArray(source.llm) &&
        !('allowInsecureHttp' in source.llm)
      ) {
        onInvalid?.('llm.allowInsecureHttp');
      }
    } else {
      candidate[key] = defaults[key];
      onInvalid?.(key);
    }
  }

  return candidate as AppConfig;
};

export class ConfigService {
  readonly #configFile: string;
  readonly #logger: AppLogger;
  readonly #writeDelayMs: number;
  #config: AppConfig = cloneDefaults();
  #timer: NodeJS.Timeout | null = null;
  #writeQueue: Promise<void> = Promise.resolve();
  #fieldVersions = new Map<keyof ConfigPatch, number>();

  constructor({ configFile, logger, writeDelayMs = 500 }: ConfigServiceOptions) {
    this.#configFile = configFile;
    this.#logger = logger;
    this.#writeDelayMs = writeDelayMs;
  }

  async initialize(): Promise<AppConfig> {
    await mkdir(path.dirname(this.#configFile), { recursive: true });

    try {
      const text = await readFile(this.#configFile, 'utf8');
      const decoded: unknown = JSON.parse(text);
      const invalidFields: string[] = [];
      this.#config = parseConfig(decoded, (field) => invalidFields.push(field));
      if (invalidFields.length > 0) {
        this.#logger.warn('Configuration fields fell back to defaults', { fields: invalidFields });
        await this.#writeNow();
      }
    } catch (error: unknown) {
      const isMissing = error instanceof Error && 'code' in error && error.code === 'ENOENT';
      this.#logger[isMissing ? 'info' : 'warn'](
        isMissing
          ? 'Creating default configuration'
          : 'Configuration could not be read; using defaults',
        isMissing ? undefined : { error },
      );
      this.#config = cloneDefaults();
      await this.#writeNow();
    }

    return this.get();
  }

  get(): AppConfig {
    return structuredClone(this.#config);
  }

  update(patch: ConfigPatch): AppConfig {
    const parsedPatch = parsePatch(patch);
    this.#config = { ...this.#config, ...parsedPatch };
    this.#markFieldsChanged(parsedPatch);
    // 高频窗口移动只更新内存并防抖写盘，避免每个 resize 事件都触发 I/O。
    this.#scheduleWrite();
    return this.get();
  }

  /** 设置页使用的可靠提交：写盘成功后才发布字段，失败时内存配置保持不变。 */
  async commit(patch: ConfigPatch): Promise<AppConfig> {
    const parsedPatch = parsePatch(patch);
    const fields = Object.keys(parsedPatch) as Array<keyof ConfigPatch>;
    const versions = new Map<keyof ConfigPatch, number>();
    for (const field of fields) {
      const nextVersion = (this.#fieldVersions.get(field) ?? 0) + 1;
      this.#fieldVersions.set(field, nextVersion);
      versions.set(field, nextVersion);
    }

    if (this.#timer) {
      clearTimeout(this.#timer);
      this.#timer = null;
      await this.#enqueueWrite();
    }

    const operation = this.#writeQueue.then(async () => {
      const candidate = { ...this.#config, ...parsedPatch };
      await this.#writeConfig(candidate);
      const published: ConfigPatch = {};
      for (const field of fields) {
        if (this.#fieldVersions.get(field) === versions.get(field)) {
          Object.assign(published, { [field]: parsedPatch[field] });
        }
      }
      this.#config = { ...this.#config, ...published };
      return this.get();
    });
    this.#writeQueue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  setWindowBounds(bounds: WindowBounds): AppConfig {
    return this.update({ window_bounds: bounds });
  }

  async flush(): Promise<void> {
    // 退出前将尚未到期的防抖写入立即排队，保证窗口状态不会丢失。
    if (this.#timer) {
      clearTimeout(this.#timer);
      this.#timer = null;
      await this.#enqueueWrite();
    }
    await this.#writeQueue;
  }

  #scheduleWrite(): void {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      this.#timer = null;
      void this.#enqueueWrite().catch(() => undefined);
    }, this.#writeDelayMs);
  }

  #enqueueWrite(): Promise<void> {
    // 所有配置写入串行，后到的状态不会被先到但更慢的写入覆盖。
    const operation = this.#writeQueue.then(() => this.#writeNow());
    this.#writeQueue = operation.catch(() => undefined);
    return operation;
  }

  async #writeNow(): Promise<void> {
    await this.#writeConfig(this.#config);
  }

  async #writeConfig(config: AppConfig): Promise<void> {
    const temporaryFile = path.join(
      path.dirname(this.#configFile),
      `.${path.basename(this.#configFile)}.${process.pid}.${Date.now()}.tmp`,
    );
    await mkdir(path.dirname(this.#configFile), { recursive: true });
    await writeFile(temporaryFile, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    try {
      await rename(temporaryFile, this.#configFile);
    } catch (error) {
      this.#logger.error('Configuration write failed', { error });
      throw error;
    }
  }

  #markFieldsChanged(patch: ConfigPatch): void {
    for (const field of Object.keys(patch) as Array<keyof ConfigPatch>) {
      this.#fieldVersions.set(field, (this.#fieldVersions.get(field) ?? 0) + 1);
    }
  }
}

const parsePatch = (patch: ConfigPatch): ConfigPatch => {
  const parsedPatch: ConfigPatch = {};
  if ('agent' in patch) parsedPatch.agent = knownConfigSchema.shape.agent.parse(patch.agent);
  if ('template_path' in patch)
    parsedPatch.template_path = knownConfigSchema.shape.template_path.parse(patch.template_path);
  if ('remote_template_path' in patch)
    parsedPatch.remote_template_path = knownConfigSchema.shape.remote_template_path.parse(
      patch.remote_template_path,
    );
  if ('report_prompt_path' in patch)
    parsedPatch.report_prompt_path = knownConfigSchema.shape.report_prompt_path.parse(
      patch.report_prompt_path,
    );
  if ('llm' in patch)
    parsedPatch.llm = llmConnectionSettingsSchema.parse(patch.llm) as LlmConnectionSettings;
  if ('remote_consent_confirmed' in patch)
    parsedPatch.remote_consent_confirmed = z.boolean().parse(patch.remote_consent_confirmed);
  if ('always_on_top' in patch) parsedPatch.always_on_top = z.boolean().parse(patch.always_on_top);
  if ('completed_expanded' in patch)
    parsedPatch.completed_expanded = z.boolean().parse(patch.completed_expanded);
  if ('window_bounds' in patch)
    parsedPatch.window_bounds = windowBoundsSchema.nullable().parse(patch.window_bounds);
  if ('note_color' in patch)
    parsedPatch.note_color = knownConfigSchema.shape.note_color.parse(patch.note_color);
  if ('note_opacity' in patch)
    parsedPatch.note_opacity = knownConfigSchema.shape.note_opacity.parse(patch.note_opacity);
  return parsedPatch;
};
