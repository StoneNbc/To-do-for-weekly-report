import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppLogger } from '../../../src/main/logging/logger';
import { ConfigService } from '../../../src/main/services/configService';

const directories: string[] = [];

const makeLogger = (): AppLogger => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  flush: vi.fn(async () => undefined),
});

const makeConfigPath = async (): Promise<string> => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'sticky-config-'));
  directories.push(directory);
  return path.join(directory, 'config.json');
};

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('ConfigService', () => {
  it('creates defaults when the configuration is missing', async () => {
    const configFile = await makeConfigPath();
    const service = new ConfigService({ configFile, logger: makeLogger(), writeDelayMs: 1 });

    const config = await service.initialize();
    const persisted = JSON.parse(await readFile(configFile, 'utf8')) as Record<string, unknown>;

    expect(config.cleanup_time).toBe('00:00');
    expect(config.always_on_top).toBe(true);
    expect(config.note_color).toBe('#FFF8E7');
    expect(config.note_opacity).toBe(1);
    expect(persisted.schema_version).toBe(1);
  });

  it('keeps unknown fields while invalid known fields fall back', async () => {
    const configFile = await makeConfigPath();
    await writeFile(
      configFile,
      JSON.stringify({
        schema_version: 1,
        cleanup_time: '12:00',
        agent: 'custom-local',
        template_path: null,
        always_on_top: 'yes',
        window_bounds: null,
        completed_expanded: true,
        note_color: '#bad',
        note_opacity: 0.2,
        future_setting: { enabled: true },
      }),
      'utf8',
    );
    const logger = makeLogger();
    const service = new ConfigService({ configFile, logger, writeDelayMs: 1 });

    const config = await service.initialize();

    expect(config.cleanup_time).toBe('00:00');
    expect(config.always_on_top).toBe(true);
    expect(config.agent).toBe('custom-local');
    expect(config.note_color).toBe('#FFF8E7');
    expect(config.note_opacity).toBe(1);
    expect(config.future_setting).toEqual({ enabled: true });
    expect(logger.warn).toHaveBeenCalled();
  });

  it('serializes reliable setting commits and preserves unknown fields', async () => {
    const configFile = await makeConfigPath();
    const service = new ConfigService({ configFile, logger: makeLogger(), writeDelayMs: 1 });
    await service.initialize();
    service.update({ window_bounds: { x: 12, y: 24, width: 340, height: 420 } });

    await Promise.all([
      service.commit({ note_color: '#e0f2fe' }),
      service.commit({ note_opacity: 0.8, completed_expanded: true }),
    ]);
    await service.flush();

    const persisted = JSON.parse(await readFile(configFile, 'utf8')) as Record<string, unknown>;
    expect(persisted.note_color).toBe('#E0F2FE');
    expect(persisted.note_opacity).toBe(0.8);
    expect(persisted.completed_expanded).toBe(true);
    expect(persisted.window_bounds).toEqual({ x: 12, y: 24, width: 340, height: 420 });
  });

  it('coalesces window state changes and flushes the latest value', async () => {
    const configFile = await makeConfigPath();
    const service = new ConfigService({ configFile, logger: makeLogger(), writeDelayMs: 60_000 });
    await service.initialize();

    service.setWindowBounds({ x: 10, y: 20, width: 320, height: 400 });
    service.setWindowBounds({ x: 30, y: 40, width: 360, height: 440 });
    service.update({ always_on_top: false, completed_expanded: true });
    await service.flush();

    const persisted = JSON.parse(await readFile(configFile, 'utf8')) as Record<string, unknown>;
    expect(persisted.window_bounds).toEqual({ x: 30, y: 40, width: 360, height: 440 });
    expect(persisted.always_on_top).toBe(false);
    expect(persisted.completed_expanded).toBe(true);
  });
});
