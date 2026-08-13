import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LocalFileLogger } from '../../../src/main/logging/logger';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('LocalFileLogger', () => {
  it('writes structured entries without task or report bodies', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'sticky-logger-'));
    directories.push(directory);
    const file = path.join(directory, 'logs', 'app.log');
    const logger = new LocalFileLogger({ file });

    logger.info('operation completed', { taskContent: 'private task', report: 'private report', count: 2 });
    await logger.flush();

    const entry = JSON.parse((await readFile(file, 'utf8')).trim()) as Record<string, unknown>;
    expect(entry.level).toBe('info');
    expect(entry.message).toBe('operation completed');
    expect(entry.context).toEqual({ taskContent: '[redacted]', report: '[redacted]', count: 2 });
  });

  it('rotates a file after the configured size is reached', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'sticky-logger-'));
    directories.push(directory);
    const file = path.join(directory, 'app.log');
    const logger = new LocalFileLogger({ file, maxBytes: 1, retainedFiles: 2 });

    logger.warn('first');
    logger.warn('second');
    await logger.flush();

    expect(await readFile(`${file}.1`, 'utf8')).toContain('first');
    expect(await readFile(file, 'utf8')).toContain('second');
  });
});
