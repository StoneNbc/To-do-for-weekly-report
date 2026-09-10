import { createHash, randomBytes } from 'node:crypto';
import { dirname, basename, resolve } from 'node:path';
import { mkdir, open, readFile, rename, rm, link } from 'node:fs/promises';
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

/** expectedRevision 与磁盘内容不一致时抛出，阻止旧界面覆盖外部修改。 */
export class FileChangedError extends Error {
  readonly code = 'FILE_CHANGED' as const;

  constructor(readonly path: string) {
    super('数据文件已更新，请刷新后重试');
    this.name = 'FileChangedError';
  }
}

export const computeRevision = (text: string): string =>
  createHash('sha256').update(text, 'utf8').digest('hex');

/**
 * 所有业务 TXT 文件的底层读写入口。
 *
 * 职责：
 * - 用「同目录临时文件 + fsync + rename」实现原子写入，避免进程中断留下半写入文件；
 * - 以文件全文 SHA-256 作为 revision，为上层提供乐观并发冲突检测；
 * - 对同一路径的操作串行排队，保证「读-改-写」的原子性。
 */
export class TextFileStore {
  constructor(private readonly writeGuard: () => void = () => undefined) {}
  // 同一路径的操作串行执行；不同文件仍可并行，避免全局锁降低响应速度。
  private readonly queues = new Map<string, Promise<void>>();

  /** 读取文件并生成快照（含 revision 与换行信息）。 */
  async read(path: string): Promise<TextFileSnapshot> {
    return this.readUnlocked(resolve(path));
  }

  /** 无条件覆盖写入，不校验 revision；适合创建缺失文件等场景。 */
  async writeAtomic(path: string, text: string): Promise<TextFileSnapshot> {
    this.writeGuard();
    const absolutePath = resolve(path);
    return this.enqueue(absolutePath, () => this.writeUnlocked(absolutePath, text));
  }

  /**
   * 读-改-写事务：校验 expectedRevision 后应用 transform，再原子写回。
   * revision 不匹配时抛出 FileChangedError，防止旧界面覆盖外部修改。
   */
  async update<T>(
    path: string,
    expectedRevision: string | null,
    transform: (
      snapshot: TextFileSnapshot,
    ) => Promise<{ text: string; result: T }> | { text: string; result: T },
  ): Promise<TextFileUpdate<T>> {
    this.writeGuard();
    const absolutePath = resolve(path);
    return this.enqueue(absolutePath, async () => {
      const current = await this.readUnlocked(absolutePath);
      // revision 是完整文件文本的 SHA-256，未知行或换行变化也会触发冲突保护。
      if (expectedRevision !== null && current.revision !== expectedRevision) {
        throw new FileChangedError(absolutePath);
      }
      const transformed = await transform(current);
      const snapshot = await this.writeUnlocked(absolutePath, transformed.text);
      return { snapshot, result: transformed.result };
    });
  }

  /**
   * 与 update 相同，但文件不存在时用 initialText 作为初始快照再执行 transform，
   * 用于首次写入历史周文件等场景。
   */
  async updateOrCreate<T>(
    path: string,
    initialText: string,
    transform: (
      snapshot: TextFileSnapshot,
    ) => Promise<{ text: string; result: T }> | { text: string; result: T },
  ): Promise<TextFileUpdate<T>> {
    this.writeGuard();
    const absolutePath = resolve(path);
    return this.enqueue(absolutePath, async () => {
      let current: TextFileSnapshot;
      try {
        current = await this.readUnlocked(absolutePath);
      } catch (error) {
        if (!isMissingFile(error)) throw error;
        // 初始快照只存在于当前串行事务中，最终仍通过同一原子写路径落盘。
        current = this.createSnapshot(absolutePath, initialText);
      }
      const transformed = await transform(current);
      const snapshot = await this.writeUnlocked(absolutePath, transformed.text);
      return { snapshot, result: transformed.result };
    });
  }

  /** 等待所有排队中的写入完成，应用退出前用于冲刷未落盘的数据。 */
  async createAtomic(path: string, text: string): Promise<TextFileSnapshot> {
    this.writeGuard();
    const absolute = resolve(path);
    return this.enqueue(absolute, async () => {
      await mkdir(dirname(absolute), { recursive: true });
      const temporary = `${absolute}.${randomBytes(8).toString('hex')}.tmp`;
      try {
        const handle = await open(temporary, 'wx', 0o600);
        try {
          await handle.writeFile(text, 'utf8');
          await handle.sync();
        } finally {
          await handle.close();
        }
        try {
          await link(temporary, absolute);
        } catch (error) {
          if (error instanceof Error && 'code' in error && error.code === 'EEXIST')
            throw new FileChangedError(absolute);
          throw error;
        }
        return this.createSnapshot(absolute, text);
      } finally {
        await rm(temporary, { force: true });
      }
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
      // 同目录临时文件 + fsync + rename，避免进程中断留下半写入的业务文件。
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
    // 前一项失败不能毒化后续队列，下一项仍应有机会读取最新磁盘状态。
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
