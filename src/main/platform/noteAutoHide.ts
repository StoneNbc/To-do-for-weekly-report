import { EDGE_REVEAL_SIZE, EDGE_SNAP_THRESHOLD } from '../../shared/constants';
import type { NoteDockEdge, WindowBounds } from '../../shared/domain';
import type { DisplayArea } from './displayBounds';

export interface NoteDisplayArea extends DisplayArea {
  id: number;
}

export interface NoteDockCandidate {
  edge: NoteDockEdge;
  displayId: number;
  visibleBounds: WindowBounds;
  hiddenBounds: WindowBounds;
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(Math.max(value, minimum), maximum);

const overlapLength = (startA: number, lengthA: number, startB: number, lengthB: number): number =>
  Math.max(0, Math.min(startA + lengthA, startB + lengthB) - Math.max(startA, startB));

const intersects = (left: WindowBounds, right: WindowBounds): boolean =>
  overlapLength(left.x, left.width, right.x, right.width) > 0 &&
  overlapLength(left.y, left.height, right.y, right.height) > 0;

export const snapNoteToEdge = (
  bounds: WindowBounds,
  workArea: WindowBounds,
  edge: NoteDockEdge,
): WindowBounds => {
  const maximumX = workArea.x + Math.max(0, workArea.width - bounds.width);
  const maximumY = workArea.y + Math.max(0, workArea.height - bounds.height);
  const x = clamp(bounds.x, workArea.x, maximumX);
  const y = clamp(bounds.y, workArea.y, maximumY);

  if (edge === 'left') return { ...bounds, x: workArea.x, y };
  if (edge === 'right') return { ...bounds, x: maximumX, y };
  return { ...bounds, x, y: workArea.y };
};

export const getHiddenNoteBounds = (
  visibleBounds: WindowBounds,
  workArea: WindowBounds,
  edge: NoteDockEdge,
  revealSize = EDGE_REVEAL_SIZE,
): WindowBounds => {
  if (edge === 'left') {
    return { ...visibleBounds, x: workArea.x - visibleBounds.width + revealSize };
  }
  if (edge === 'right') {
    return { ...visibleBounds, x: workArea.x + workArea.width - revealSize };
  }
  return { ...visibleBounds, y: workArea.y, height: revealSize };
};

const getProjectedOutsideBounds = (
  visibleBounds: WindowBounds,
  workArea: WindowBounds,
  edge: NoteDockEdge,
  revealSize: number,
): WindowBounds => {
  const outsideWidth = Math.max(0, visibleBounds.width - revealSize);
  const outsideHeight = Math.max(0, visibleBounds.height - revealSize);
  if (edge === 'left') {
    return {
      x: workArea.x - outsideWidth,
      y: visibleBounds.y,
      width: outsideWidth,
      height: visibleBounds.height,
    };
  }
  if (edge === 'right') {
    return {
      x: workArea.x + workArea.width,
      y: visibleBounds.y,
      width: outsideWidth,
      height: visibleBounds.height,
    };
  }
  return {
    x: visibleBounds.x,
    y: workArea.y - outsideHeight,
    width: visibleBounds.width,
    height: outsideHeight,
  };
};

export const isExternalNoteEdge = (
  visibleBounds: WindowBounds,
  display: NoteDisplayArea,
  displays: readonly NoteDisplayArea[],
  edge: NoteDockEdge,
  revealSize = EDGE_REVEAL_SIZE,
): boolean => {
  const outsideBounds = getProjectedOutsideBounds(
    visibleBounds,
    display.workArea,
    edge,
    revealSize,
  );
  return !displays.some(
    (candidate) => candidate.id !== display.id && intersects(outsideBounds, candidate.workArea),
  );
};

export const detectNoteDockCandidate = (
  bounds: WindowBounds,
  display: NoteDisplayArea,
  displays: readonly NoteDisplayArea[],
  threshold = EDGE_SNAP_THRESHOLD,
  revealSize = EDGE_REVEAL_SIZE,
): NoteDockCandidate | null => {
  const area = display.workArea;
  const horizontalOverlap = overlapLength(bounds.x, bounds.width, area.x, area.width);
  const verticalOverlap = overlapLength(bounds.y, bounds.height, area.y, area.height);
  const candidates: Array<{ edge: NoteDockEdge; gap: number; priority: number }> = [];

  const leftGap = bounds.x - area.x;
  const rightGap = area.x + area.width - (bounds.x + bounds.width);
  const topGap = bounds.y - area.y;
  if (verticalOverlap > 0 && leftGap <= threshold) {
    candidates.push({ edge: 'left', gap: Math.max(0, leftGap), priority: 0 });
  }
  if (verticalOverlap > 0 && rightGap <= threshold) {
    candidates.push({ edge: 'right', gap: Math.max(0, rightGap), priority: 1 });
  }
  if (horizontalOverlap > 0 && topGap <= threshold) {
    candidates.push({ edge: 'top', gap: Math.max(0, topGap), priority: 2 });
  }

  candidates.sort((left, right) => left.gap - right.gap || left.priority - right.priority);
  for (const candidate of candidates) {
    const visibleBounds = snapNoteToEdge(bounds, area, candidate.edge);
    if (!isExternalNoteEdge(visibleBounds, display, displays, candidate.edge, revealSize)) continue;
    return {
      edge: candidate.edge,
      displayId: display.id,
      visibleBounds,
      hiddenBounds: getHiddenNoteBounds(visibleBounds, area, candidate.edge, revealSize),
    };
  }
  return null;
};
