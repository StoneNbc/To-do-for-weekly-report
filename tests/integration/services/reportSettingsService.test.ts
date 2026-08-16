import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_LLM_SETTINGS } from '../../../src/shared/constants';
import { ReportSettingsService } from '../../../src/main/services/reportSettingsService';
import type { ConfigService } from '../../../src/main/services/configService';
import type { CredentialService } from '../../../src/main/services/credentialService';
import type { ReportTemplateService } from '../../../src/main/services/reportTemplateService';

describe('ReportSettingsService connection test', () => {
  it('只发送固定短消息和连接配置，不发送模板、提示词或任务', async () => {
    const complete = vi.fn(async () => 'OK');
    const templates = {
      getDefault: () => '不应发送的模板 {{tasks}}',
    } as unknown as ReportTemplateService;
    const service = new ReportSettingsService({
      config: {} as ConfigService,
      recordTemplates: templates,
      remoteTemplates: templates,
      prompts: templates,
      credentials: {
        get: vi.fn(async () => null),
      } as unknown as CredentialService,
      llmClient: { complete },
    });

    await service.testConnection({
      llm: {
        ...DEFAULT_LLM_SETTINGS,
        baseUrl: 'https://example.com/v1',
        model: 'test-model',
        temperature: 1.2,
        maxTokens: 4096,
      },
      apiKey: 'sk-test',
    });

    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: 'https://example.com/v1',
        model: 'test-model',
        temperature: 0,
        maxTokens: 8,
      }),
      'sk-test',
      [{ role: 'user', content: '连接测试：请只回复 OK' }],
    );
    const serializedRequest = JSON.stringify(complete.mock.calls[0]);
    expect(serializedRequest).not.toContain('{{tasks}}');
    expect(serializedRequest).not.toContain('不应发送的模板');
  });
});
