import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { AppLogger } from '../logging/logger';

export interface SafeStorageAdapter {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

const secretFileSchema = z.object({
  schema_version: z.literal(1),
  origin: z.string().url(),
  encrypted_api_key: z.string().min(1),
});

export interface StoredCredential {
  apiKey: string;
  origin: string;
}

export class CredentialService {
  constructor(
    private readonly secretsFile: string,
    private readonly safeStorage: SafeStorageAdapter,
    private readonly logger: AppLogger,
  ) {}

  isAvailable(): boolean {
    return this.safeStorage.isEncryptionAvailable();
  }

  async get(origin: string): Promise<StoredCredential | null> {
    if (!this.isAvailable()) return null;
    try {
      const raw: unknown = JSON.parse(await readFile(this.secretsFile, 'utf8'));
      const stored = secretFileSchema.parse(raw);
      if (stored.origin !== origin) return null;
      const apiKey = this.safeStorage.decryptString(
        Buffer.from(stored.encrypted_api_key, 'base64'),
      );
      return { apiKey, origin };
    } catch (error: unknown) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
      this.logger.warn('Stored LLM credential could not be read', { error });
      return null;
    }
  }

  async save(origin: string, apiKey: string): Promise<void> {
    if (!this.isAvailable()) throw new Error('当前系统无法安全保存 API Key');
    const trimmed = apiKey.trim();
    if (!trimmed) throw new RangeError('API Key 不能为空');
    const encrypted = this.safeStorage.encryptString(trimmed).toString('base64');
    await this.#write({ schema_version: 1, origin, encrypted_api_key: encrypted });
  }

  async clear(): Promise<void> {
    await rm(this.secretsFile, { force: true });
  }

  async #write(value: z.infer<typeof secretFileSchema>): Promise<void> {
    const directory = path.dirname(this.secretsFile);
    const temporary = path.join(
      directory,
      `.${path.basename(this.secretsFile)}.${process.pid}.${Date.now()}.tmp`,
    );
    await mkdir(directory, { recursive: true });
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    await rename(temporary, this.secretsFile);
  }
}

export const maskApiKey = (apiKey: string): string => {
  if (apiKey.length <= 8) return '••••••••';
  return `${apiKey.slice(0, 3)}••••${apiKey.slice(-4)}`;
};
