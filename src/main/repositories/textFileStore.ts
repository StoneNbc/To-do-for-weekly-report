import { createHash, randomBytes } from 'node:crypto';
import { dirname, basename, resolve } from 'node:path';
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { decodeText, type LineEnding } from '../parsers/lineEndings';

export interface TextFileSnapshot {
  path: string;
  text: string;
  revision: string;
  eol: LineEnding;
  endsWithEol: boolean;
}

export interface TextFileUpdate<T> {
  snapshot: TextFileSnapshot;
  result: T;
}

export class FileChangedError extends Error {
  readonly code = 'FILE_CHANGED' as const;

  constructor(readonly path: string) {
    super('数据文件已更新，请刷新后重试');
    this.name = 'FileChangedError';
  }
}

export const computeRevision = (text: string): string =>
  createHash('sha256').update(text, 'utf8').digest('hex');

export class TextFileStore {
  private readonly queues = new Map<string, Promise<void>>();

  async read(path: string): Promise<TextFileSnapshot> {
    return this.readUnlocked(resolve(path));
  }

  async writeAtomic(path: string, text: string): Promise<TextFileSnapshot> {
    const absolutePath = resolve(path);
    return this.enqueue(absolutePath, () => this.writeUnlocked(absolutePath, text));
  }

  async update<T>(
    path: string,
    expectedRevision: string | null,
    transform: (
      snapshot: TextFileSnapshot,
    ) => Promise<{ text: string; result: T }> | { text: string; result: T },
  ): Promise<TextFileUpdate<T>> {
    const absolutePath = resolve(path);
    return this.enqueue(absolutePath, async () => {
      const current = await this.readUnlocked(absolutePath);
      if (expectedRevision !== null && current.revision !== expectedRevision) {
        throw new FileChangedError(absolutePath);
      }
      const transformed = await transform(current);
      const snapshot = await this.writeUnlocked(absolutePath, transformed.text);
      return { snapshot, result: transformed.result };
    });
  }

  async updateOrCreate<T>(
    path: string,
    initialText: string,
    transform: (
      snapshot: TextFileSnapshot,
    ) => Promise<{ text: string; result: T }> | { text: string; result: T },
  ): Promise<TextFileUpdate<T>> {
    const absolutePath = resolve(path);
    return this.enqueue(absolutePath, async () => {
      let current: TextFileSnapshot;
      try {
        current = await this.readUnlocked(absolutePath);
      } catch (error) {
        if (!isMissingFile(error)) throw error;
        current = this.createSnapshot(absolutePath, initialText);
      }
      const transformed = await transform(current);
      const snapshot = await this.writeUnlocked(absolutePath, transformed.text);
      return { snapshot, result: transformed.result };
    });
  }

  async drain(): Promise<void> {
    await Promise.all([...this.queues.values()]);
  }

  private async readUnlocked(path: string): Promise<TextFileSnapshot> {
    const text = await readFile(path, 'utf8');
    return this.createSnapshot(path, text);
  }

  private async writeUnlocked(path: string, text: string): Promise<TextFileSnapshot> {
    const parent = dirname(path);
    await mkdir(parent, { recursive: true });
    const nonce = randomBytes(8).toString('hex');
    const temporaryPath = resolve(parent, `.${basename(path)}.${process.pid}.${nonce}.tmp`);
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      handle = await open(temporaryPath, 'wx', 0o600);
      await handle.writeFile(text, 'utf8');
      await handle.sync();
      await handle.close();
      handle = undefined;
      await rename(temporaryPath, path);
      return this.createSnapshot(path, text);
    } catch (error) {
      await handle?.close().catch(() => undefined);
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  private createSnapshot(path: string, text: string): TextFileSnapshot {
    const decoded = decodeText(text);
    return {
      path,
      text,
      revision: computeRevision(text),
      eol: decoded.eol,
      endsWithEol: decoded.endsWithEol,
    };
  }

  private async enqueue<T>(path: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(path) ?? Promise.resolve();
    const execution = previous.catch(() => undefined).then(operation);
    const settled = execution.then(
      () => undefined,
      () => undefined,
    );
    this.queues.set(path, settled);
    try {
      return await execution;
    } finally {
      if (this.queues.get(path) === settled) this.queues.delete(path);
    }
  }
}

const isMissingFile = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT';
