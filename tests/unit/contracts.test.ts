import { describe, expect, it } from 'vitest';
import { failure, ok } from '../../src/shared/results';
import { normalizeTaskContent } from '../../src/shared/validation';

describe('Wave 0 contracts', () => {
  it('creates stable result envelopes', () => {
    expect(ok('ready')).toEqual({ ok: true, data: 'ready' });
    expect(failure('NOT_IMPLEMENTED', 'Wave 1')).toEqual({
      ok: false,
      error: { code: 'NOT_IMPLEMENTED', message: 'Wave 1' },
    });
  });

  it('normalizes task input to a single trimmed line', () => {
    expect(normalizeTaskContent('  第一行\n第二行  ')).toBe('第一行 第二行');
  });
});
