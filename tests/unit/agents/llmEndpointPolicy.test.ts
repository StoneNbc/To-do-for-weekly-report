import { describe, expect, it } from 'vitest';
import {
  getChatCompletionsUrl,
  getLlmCredentialOrigin,
  isLoopbackLlmBaseUrl,
  normalizeLlmBaseUrl,
} from '../../../src/main/agents/llmEndpointPolicy';

describe('LLM endpoint policy', () => {
  it('normalizes HTTPS and permits loopback HTTP', () => {
    expect(normalizeLlmBaseUrl('https://api.deepseek.com/')).toBe('https://api.deepseek.com');
    expect(getChatCompletionsUrl('http://127.0.0.1:11434/v1/')).toBe(
      'http://127.0.0.1:11434/v1/chat/completions',
    );
    expect(getLlmCredentialOrigin('https://example.com/v1')).toBe('https://example.com');
    expect(isLoopbackLlmBaseUrl('http://localhost:11434/v1')).toBe(true);
    expect(isLoopbackLlmBaseUrl('https://example.com/v1')).toBe(false);
  });

  it('permits explicit insecure HTTP without weakening the default policy', () => {
    const url = 'http://221.178.103.68/v1';
    expect(() => normalizeLlmBaseUrl(url)).toThrow('必须使用 HTTPS');
    expect(normalizeLlmBaseUrl(url, true)).toBe(url);
    expect(getChatCompletionsUrl(url, true)).toBe(`${url}/chat/completions`);
  });

  it.each([
    'http://example.com/v1',
    'https://user:password@example.com/v1',
    'https://example.com/v1?token=secret',
    'file:///tmp/model',
  ])('rejects unsafe endpoint %s', (url) => {
    expect(() => normalizeLlmBaseUrl(url)).toThrow();
  });
});
