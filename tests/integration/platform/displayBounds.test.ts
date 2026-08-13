import { describe, expect, it } from 'vitest';
import { isBoundsVisible, restoreVisibleBounds } from '../../../src/main/platform/displayBounds';

const primary = { workArea: { x: 0, y: 0, width: 1_440, height: 900 }, primary: true };

describe('display bounds recovery', () => {
  it('preserves a usable remembered position', () => {
    const saved = { x: 900, y: 120, width: 320, height: 400 };
    expect(
      restoreVisibleBounds({
        saved,
        displays: [primary],
        defaults: { width: 320, height: 400 },
        minimum: { width: 280, height: 280 },
      }),
    ).toEqual(saved);
  });

  it('moves an off-screen position to the primary display', () => {
    const restored = restoreVisibleBounds({
      saved: { x: 3_000, y: 2_000, width: 320, height: 400 },
      displays: [primary],
      defaults: { width: 320, height: 400 },
      minimum: { width: 280, height: 280 },
    });

    expect(isBoundsVisible(restored, [primary])).toBe(true);
    expect(restored).toEqual({ x: 1_096, y: 24, width: 320, height: 400 });
  });

  it('shrinks an oversized window to fit the available work area', () => {
    const restored = restoreVisibleBounds({
      saved: { x: 0, y: 0, width: 2_000, height: 1_200 },
      displays: [primary],
      defaults: { width: 320, height: 400 },
      minimum: { width: 280, height: 280 },
    });

    expect(restored.width).toBe(1_440);
    expect(restored.height).toBe(900);
    expect(restored.x).toBe(0);
    expect(restored.y).toBe(0);
  });
});
