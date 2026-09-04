import { describe, expect, it } from 'vitest';
import {
  detectNoteDockCandidate,
  getHiddenNoteBounds,
  snapNoteToEdge,
  type NoteDisplayArea,
} from '../../../src/main/platform/noteAutoHide';

const primary: NoteDisplayArea = {
  id: 1,
  primary: true,
  workArea: { x: 0, y: 24, width: 1_440, height: 876 },
};

describe('note edge auto-hide geometry', () => {
  it.each([
    [{ x: 12, y: 100, width: 320, height: 400 }, 'left'],
    [{ x: 1_108, y: 100, width: 320, height: 400 }, 'right'],
    [{ x: 500, y: 36, width: 320, height: 400 }, 'top'],
  ] as const)('detects %s at the snap threshold', (bounds, edge) => {
    expect(detectNoteDockCandidate(bounds, primary, [primary])?.edge).toBe(edge);
  });

  it('does not dock beyond the threshold or at the bottom edge', () => {
    expect(
      detectNoteDockCandidate({ x: 13, y: 100, width: 320, height: 400 }, primary, [primary]),
    ).toBeNull();
    expect(
      detectNoteDockCandidate({ x: 500, y: 500, width: 320, height: 400 }, primary, [primary]),
    ).toBeNull();
  });

  it('accepts a window slightly beyond an external edge and snaps it fully visible', () => {
    const candidate = detectNoteDockCandidate(
      { x: -40, y: 100, width: 320, height: 400 },
      primary,
      [primary],
    );
    expect(candidate).toMatchObject({
      edge: 'left',
      visibleBounds: { x: 0, y: 100, width: 320, height: 400 },
    });
  });

  it('prefers a side edge when a corner is equidistant', () => {
    expect(
      detectNoteDockCandidate({ x: 8, y: 32, width: 320, height: 400 }, primary, [primary])?.edge,
    ).toBe('left');
  });

  it('clamps the free axis while snapping', () => {
    expect(
      snapNoteToEdge({ x: 200, y: -100, width: 320, height: 400 }, primary.workArea, 'right'),
    ).toEqual({ x: 1_120, y: 24, width: 320, height: 400 });
  });

  it('keeps only a two-DIP strip at each supported edge', () => {
    const visible = { x: 0, y: 100, width: 320, height: 400 };
    expect(getHiddenNoteBounds(visible, primary.workArea, 'left')).toEqual({
      x: 0,
      y: 100,
      width: 2,
      height: 400,
    });
    expect(getHiddenNoteBounds({ ...visible, x: 1_120 }, primary.workArea, 'right')).toEqual({
      x: 1_438,
      y: 100,
      width: 2,
      height: 400,
    });
    expect(getHiddenNoteBounds({ ...visible, x: 500, y: 24 }, primary.workArea, 'top')).toEqual({
      x: 500,
      y: 24,
      width: 320,
      height: 2,
    });
  });

  it('rejects an internal display seam but accepts a non-overlapping outer segment', () => {
    const right: NoteDisplayArea = {
      id: 2,
      workArea: { x: 1_440, y: 200, width: 1_200, height: 700 },
    };
    expect(
      detectNoteDockCandidate({ x: 1_120, y: 300, width: 320, height: 400 }, primary, [
        primary,
        right,
      ]),
    ).toBeNull();
    expect(
      detectNoteDockCandidate({ x: 1_120, y: 30, width: 320, height: 120 }, primary, [
        primary,
        right,
      ])?.edge,
    ).toBe('right');
  });

  it('supports displays with negative coordinates', () => {
    const left: NoteDisplayArea = {
      id: 3,
      workArea: { x: -1_280, y: 0, width: 1_280, height: 800 },
    };
    expect(
      detectNoteDockCandidate({ x: -1_280, y: 80, width: 320, height: 400 }, left, [left, primary]),
    ).toMatchObject({ edge: 'left', displayId: 3 });
  });
});
