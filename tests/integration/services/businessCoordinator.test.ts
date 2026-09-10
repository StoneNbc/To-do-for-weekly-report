import { describe, expect, it } from 'vitest';
import { BusinessCoordinator } from '../../../src/main/services/businessCoordinator';

describe('BusinessCoordinator', () => {
  it('serializes independent operations while allowing nested service calls', async () => {
    const coordinator = new BusinessCoordinator();
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = coordinator.run(async () => {
      order.push('rename-start');
      await gate;
      await coordinator.run(async () => {
        order.push('nested-read');
      });
      order.push('rename-end');
    });
    const second = coordinator.run(async () => {
      order.push('archive');
    });
    await Promise.resolve();
    expect(order).toEqual(['rename-start']);
    release();
    await Promise.all([first, second]);
    expect(order).toEqual(['rename-start', 'nested-read', 'rename-end', 'archive']);
  });

  it('blocks queued writes after recovery conflict but permits inspection and recovery', async () => {
    const coordinator = new BusinessCoordinator();
    await coordinator.run(async () => {
      coordinator.blocked = true;
    });
    await expect(coordinator.run(async () => 'write')).rejects.toMatchObject({
      code: 'PROJECT_RECOVERY_REQUIRED',
    });
    expect(await coordinator.run(async () => 'read', { readOnly: true })).toBe('read');
    await coordinator.run(
      async () => {
        coordinator.assertWritable();
        coordinator.blocked = false;
      },
      { recovery: true },
    );
    expect(await coordinator.run(async () => 'write')).toBe('write');
  });
});
