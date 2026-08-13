import { describe, expect, it, vi } from 'vitest';
import type { AppLogger } from '../../../src/main/logging/logger';
import { installLocalOnlyNetworkPolicy } from '../../../src/main/platform/networkPolicy';

const makeLogger = (): AppLogger => ({
  debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), flush: vi.fn(async () => undefined),
});

describe('local-only network policy', () => {
  it('blocks HTTP and WebSocket requests in production while allowing local files', () => {
    let handler: ((details: { url: string }, callback: (response: { cancel: boolean }) => void) => void) | undefined;
    const webRequest = { onBeforeRequest: vi.fn((next) => { handler = next; }) };
    installLocalOnlyNetworkPolicy({ webRequest } as never, makeLogger());
    const check = (url: string): boolean => {
      let cancelled = false;
      handler?.({ url }, (response) => { cancelled = response.cancel; });
      return cancelled;
    };

    expect(check('file:///Applications/sticky/index.html')).toBe(false);
    expect(check('https://example.com/private')).toBe(true);
    expect(check('ws://127.0.0.1:5173')).toBe(true);
  });

  it('allows only the configured Vite origin during development', () => {
    let handler: ((details: { url: string }, callback: (response: { cancel: boolean }) => void) => void) | undefined;
    const webRequest = { onBeforeRequest: vi.fn((next) => { handler = next; }) };
    installLocalOnlyNetworkPolicy({ webRequest } as never, makeLogger(), 'http://127.0.0.1:5173');
    const check = (url: string): boolean => {
      let cancelled = false;
      handler?.({ url }, (response) => { cancelled = response.cancel; });
      return cancelled;
    };

    expect(check('http://127.0.0.1:5173/main.tsx')).toBe(false);
    expect(check('http://localhost:5173/main.tsx')).toBe(true);
    expect(check('https://example.com')).toBe(true);
  });
});
