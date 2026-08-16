import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppLogger } from '../../../src/main/logging/logger';
import {
  CredentialService,
  type SafeStorageAdapter,
} from '../../../src/main/services/credentialService';

const directories: string[] = [];
const logger: AppLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  flush: vi.fn(async () => undefined),
};
const storage: SafeStorageAdapter = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(`encrypted:${value}`),
  decryptString: (value) => value.toString().replace(/^encrypted:/, ''),
};

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('CredentialService', () => {
  it('encrypts the API key and binds it to one normalized origin', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'sticky-credential-'));
    directories.push(directory);
    const file = path.join(directory, 'secrets.json');
    const service = new CredentialService(file, storage, logger);

    await service.save('https://api.example.com', 'sk-private-value');

    expect(await readFile(file, 'utf8')).not.toContain('sk-private-value');
    expect(await service.get('https://other.example.com')).toBeNull();
    expect(await service.get('https://api.example.com')).toEqual({
      origin: 'https://api.example.com',
      apiKey: 'sk-private-value',
    });
    await service.clear();
    expect(await service.get('https://api.example.com')).toBeNull();
  });
});
