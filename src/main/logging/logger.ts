import { mkdir, rename, rm, stat, appendFile } from 'node:fs/promises';
import path from 'node:path';

export type LogContext = Record<string, unknown>;

export interface AppLogger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  flush(): Promise<void>;
}

export interface LocalLoggerOptions {
  file: string;
  maxBytes?: number;
  retainedFiles?: number;
  debug?: boolean;
}

const REDACTED_KEYS =
  /(?:api.?key|authorization|bearer|content|body|report|secret|task|text|token)/i;

const sanitize = (value: unknown, key = '', depth = 0): unknown => {
  // 日志只记录诊断元数据，不落盘任务正文或周报内容。
  if (REDACTED_KEYS.test(key)) return '[redacted]';
  if (depth > 4) return '[truncated]';
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (typeof value === 'string') return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => sanitize(item, '', depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([childKey, childValue]) => [
        childKey,
        sanitize(childValue, childKey, depth + 1),
      ]),
    );
  }
  return value;
};

export class LocalFileLogger implements AppLogger {
  readonly #file: string;
  readonly #maxBytes: number;
  readonly #retainedFiles: number;
  readonly #debugEnabled: boolean;
  #queue: Promise<void> = Promise.resolve();

  constructor({
    file,
    maxBytes = 3 * 1024 * 1024,
    retainedFiles = 3,
    debug = false,
  }: LocalLoggerOptions) {
    this.#file = file;
    this.#maxBytes = maxBytes;
    this.#retainedFiles = retainedFiles;
    this.#debugEnabled = debug;
  }

  debug(message: string, context?: LogContext): void {
    if (this.#debugEnabled) this.#enqueue('debug', message, context);
  }

  info(message: string, context?: LogContext): void {
    this.#enqueue('info', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.#enqueue('warn', message, context);
  }

  error(message: string, context?: LogContext): void {
    this.#enqueue('error', message, context);
  }

  async flush(): Promise<void> {
    await this.#queue;
  }

  #enqueue(level: string, message: string, context?: LogContext): void {
    const entry = `${JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(context ? { context: sanitize(context) } : {}),
    })}\n`;

    // 串行追加和轮转，避免并发日志互相覆盖或交错写入。
    this.#queue = this.#queue
      .then(async () => {
        await mkdir(path.dirname(this.#file), { recursive: true });
        await this.#rotateIfNeeded(Buffer.byteLength(entry));
        await appendFile(this.#file, entry, 'utf8');
      })
      .catch((error: unknown) => {
        // 日志失败不能终止桌面进程；回退只写本机控制台。
        console.error('Local log write failed', error);
      });
  }

  async #rotateIfNeeded(incomingBytes: number): Promise<void> {
    const currentSize = await stat(this.#file)
      .then((value) => value.size)
      .catch(() => 0);
    if (currentSize + incomingBytes <= this.#maxBytes) return;

    if (this.#retainedFiles > 0) {
      await rm(`${this.#file}.${this.#retainedFiles}`, { force: true });
      for (let index = this.#retainedFiles - 1; index >= 1; index -= 1) {
        await rename(`${this.#file}.${index}`, `${this.#file}.${index + 1}`).catch(() => undefined);
      }
      await rename(this.#file, `${this.#file}.1`).catch(() => undefined);
    } else {
      await rm(this.#file, { force: true });
    }
  }
}
