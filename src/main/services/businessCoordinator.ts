import { AsyncLocalStorage } from 'node:async_hooks';

export class ProjectRecoveryError extends Error {
  readonly code = 'PROJECT_RECOVERY_REQUIRED';
  constructor() {
    super('项目改名尚未恢复，请先在项目管理中检查恢复状态');
  }
}

/** Reentrant within one operation; separate IPC/scheduler operations share a queue. */
export class BusinessCoordinator {
  private queue: Promise<void> = Promise.resolve();
  private context = new AsyncLocalStorage<{ recovery: boolean }>();
  blocked = false;

  assertWritable(): void {
    if (this.blocked && !this.context.getStore()?.recovery) throw new ProjectRecoveryError();
  }

  run<T>(
    operation: () => Promise<T>,
    options: { readOnly?: boolean; recovery?: boolean } = {},
  ): Promise<T> {
    const execute = () => {
      if (!options.readOnly && !options.recovery) this.assertWritable();
      return operation();
    };
    if (this.context.getStore())
      return Promise.resolve().then(() =>
        options.recovery ? this.context.run({ recovery: true }, execute) : execute(),
      );
    const result = this.queue.then(() =>
      this.context.run({ recovery: options.recovery === true }, execute),
    );
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  /** Composition-root adapter; synchronous helpers are deliberately not wrapped. */
  wrap<T extends object>(
    target: T,
    methods: readonly (keyof T)[],
    readOnly: readonly (keyof T)[] = [],
  ): T {
    return new Proxy(target, {
      get: (object, key) => {
        const value: unknown = Reflect.get(object, key);
        if (typeof value !== 'function') return value;
        if (!methods.includes(key as keyof T)) return value.bind(object);
        return (...args: unknown[]) =>
          this.run(() => value.apply(object, args), {
            readOnly: readOnly.includes(key as keyof T),
          });
      },
    });
  }

  async drain(): Promise<void> {
    await this.queue;
  }
}
