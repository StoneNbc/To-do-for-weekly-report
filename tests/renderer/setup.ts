import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

beforeEach(() => {
  // Renderer 夹具以 2026-08-13 为“今天”；只冻结 Date，保留真实 timer 供 waitFor 使用。
  vi.useFakeTimers({ now: new Date(2026, 7, 13, 12), toFake: ['Date'] });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
