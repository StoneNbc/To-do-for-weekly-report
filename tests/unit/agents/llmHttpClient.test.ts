import { afterEach, describe, expect, it, vi } from 'vitest';
import { LlmHttpClient } from '../../../src/main/agents/llmHttpClient';

const settings = {
  provider: 'deepseek' as const,
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-v4-flash',
  temperature: 0.3,
  maxTokens: 2_000,
  timeoutMs: 5_000,
  allowInsecureHttp: false,
};

afterEach(() => vi.unstubAllGlobals());

describe('OpenAI-compatible HTTP client', () => {
  it('sends the minimal Chat Completions request without following redirects', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ choices: [{ message: { content: '生成结果' } }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await new LlmHttpClient().complete(settings, 'secret-key', [
      { role: 'user', content: '固定测试内容' },
    ]);

    expect(result).toBe('生成结果');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.deepseek.com/chat/completions',
      expect.objectContaining({
        method: 'POST',
        redirect: 'manual',
        headers: expect.objectContaining({ authorization: 'Bearer secret-key' }),
      }),
    );
  });

  it.each([
    [401, 'REMOTE_AUTH_FAILED'],
    [429, 'REMOTE_RATE_LIMITED'],
    [302, 'NETWORK_POLICY_BLOCKED'],
  ] as const)('maps HTTP %s to %s', async (status, code) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status })),
    );
    await expect(
      new LlmHttpClient().complete(settings, 'secret-key', [{ role: 'user', content: 'test' }]),
    ).rejects.toMatchObject({ code });
  });
});
