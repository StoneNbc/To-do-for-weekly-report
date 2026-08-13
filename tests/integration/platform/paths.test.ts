import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveDataPaths } from '../../../src/main/platform/paths';

describe('data path resolution', () => {
  it('uses the app userData directory for a packaged build', () => {
    const paths = resolveDataPaths({
      app: { isPackaged: true, getPath: () => '/Users/person/Library/AppData' },
      cwd: '/workspace',
      environment: { NODE_ENV: 'production', STICKY_WEEKLY_DATA_DIR: '/tmp/ignored' },
    });

    expect(paths.root).toBe(path.join('/Users/person/Library/AppData', 'data'));
  });

  it('allows an explicit test-only data directory override', () => {
    const paths = resolveDataPaths({
      app: { isPackaged: false, getPath: () => '/unused' },
      cwd: '/workspace',
      environment: { NODE_ENV: 'test', STICKY_WEEKLY_DATA_DIR: '/tmp/sticky-test' },
    });

    expect(paths.root).toBe(path.resolve('/tmp/sticky-test'));
    expect(paths.weeksDirectory).toBe(path.join(paths.root, 'weeks'));
    expect(paths.logFile).toBe(path.join(paths.root, 'logs', 'app.log'));
  });

  it('keeps the development default inside the project', () => {
    const paths = resolveDataPaths({
      app: { isPackaged: false, getPath: () => '/unused' },
      cwd: '/workspace',
      environment: { NODE_ENV: 'production', STICKY_WEEKLY_DATA_DIR: '/tmp/ignored' },
    });

    expect(paths.root).toBe(path.resolve('/workspace/data'));
  });
});
