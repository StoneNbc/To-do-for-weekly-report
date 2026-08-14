import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { DEFAULT_CONFIG } from '../../shared/constants';
import type { AppConfig, WindowBounds } from '../../shared/domain';
import type { AppLogger } from '../logging/logger';

const windowBoundsSchema = z.object({
  x: z.number().int().finite(),
  y: z.number().int().finite(),
  width: z.number().int().positive().max(20_000),
  height: z.number().int().positive().max(20_000),
});

const knownConfigSchema = z.object({
  schema_version: z.literal(1),
  cleanup_time: z.literal('00:00'),
  agent: z.string().trim().min(1).max(128),
  template_path: z.string().max(4_096).nullable(),
  always_on_top: z.boolean(),
  window_bounds: windowBoundsSchema.nullable(),
  completed_expanded: z.boolean(),
});

export type ConfigPatch = Partial<
  Pick<AppConfig, 'always_on_top' | 'window_bounds' | 'completed_expanded'>
>;

export interface ConfigServiceOptions {
  configFile: string;
  logger: AppLogger;
  writeDelayMs?: number;
}

const cloneDefaults = (): AppConfig => ({ ...DEFAULT_CONFIG });

/** 按字段回退无效值，同时保留当前版本不认识的扩展字段。 */
export const parseConfig = (input: unknown, onInvalid?: (field: string) => void): AppConfig => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    onInvalid?.('root');
    return cloneDefaults();
  }

  const source = input as Record<string, unknown>;
  const defaults = cloneDefaults();
  const candidate: Record<string, unknown> = { ...source };

  for (const key of Object.keys(DEFAULT_CONFIG) as Array<keyof typeof DEFAULT_CONFIG>) {
    const fieldSchema = knownConfigSchema.shape[key];
    const result = fieldSchema.safeParse(source[key]);
    if (result.success) {
      candidate[key] = result.data;
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
    const parsedPatch: ConfigPatch = {};
    if ('always_on_top' in patch)
      parsedPatch.always_on_top = z.boolean().parse(patch.always_on_top);
    if ('completed_expanded' in patch)
      parsedPatch.completed_expanded = z.boolean().parse(patch.completed_expanded);
    if ('window_bounds' in patch)
      parsedPatch.window_bounds = windowBoundsSchema.nullable().parse(patch.window_bounds);
    this.#config = { ...this.#config, ...parsedPatch };
    // 高频窗口移动只更新内存并防抖写盘，避免每个 resize 事件都触发 I/O。
    this.#scheduleWrite();
    return this.get();
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
      void this.#enqueueWrite();
    }, this.#writeDelayMs);
  }

  #enqueueWrite(): Promise<void> {
    // 所有配置写入串行，后到的状态不会被先到但更慢的写入覆盖。
    this.#writeQueue = this.#writeQueue.then(() => this.#writeNow());
    return this.#writeQueue;
  }

  async #writeNow(): Promise<void> {
    const temporaryFile = path.join(
      path.dirname(this.#configFile),
      `.${path.basename(this.#configFile)}.${process.pid}.${Date.now()}.tmp`,
    );
    await mkdir(path.dirname(this.#configFile), { recursive: true });
    await writeFile(temporaryFile, `${JSON.stringify(this.#config, null, 2)}\n`, 'utf8');
    try {
      await rename(temporaryFile, this.#configFile);
    } catch (error) {
      this.#logger.error('Configuration write failed', { error });
      throw error;
    }
  }
}
