/**
 * 便利贴贴边自动隐藏的几何计算工具。
 * 负责检测窗口是否靠近屏幕边缘、计算吸附位置和隐藏后的边界，
 * 并确保只在「外边缘没有相邻显示器」时才允许贴边，避免窗口藏到另一个屏幕里。
 */
import { EDGE_REVEAL_SIZE, EDGE_SNAP_THRESHOLD } from '../../shared/constants';
import type { NoteDockEdge, WindowBounds } from '../../shared/domain';
import type { DisplayArea } from './displayBounds';

/** 带有显示器 ID 的工作区信息，用于区分多屏环境下的贴边目标。 */
export interface NoteDisplayArea extends DisplayArea {
  id: number;
}

/** 一次贴边检测的结果：吸附到哪条边、在哪个显示器、可见与隐藏时的边界。 */
export interface NoteDockCandidate {
  edge: NoteDockEdge;
  displayId: number;
  visibleBounds: WindowBounds;
  hiddenBounds: WindowBounds;
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(Math.max(value, minimum), maximum);

/** 计算两条线段的重叠长度，用于判断窗口与工作区是否有足够交集。 */
const overlapLength = (startA: number, lengthA: number, startB: number, lengthB: number): number =>
  Math.max(0, Math.min(startA + lengthA, startB + lengthB) - Math.max(startA, startB));

/** 两个矩形是否有面积交集（仅重叠 > 0 不够，需两个维度都 > 0）。 */
const intersects = (left: WindowBounds, right: WindowBounds): boolean =>
  overlapLength(left.x, left.width, right.x, right.width) > 0 &&
  overlapLength(left.y, left.height, right.y, right.height) > 0;

/** 将窗口吸附到指定边缘，保持另一维度的位置不变。 */
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

/** 计算贴边隐藏后的窗口边界：把原生窗口本身缩成 revealSize，避免系统回收越界窗口。 */
export const getHiddenNoteBounds = (
  visibleBounds: WindowBounds,
  workArea: WindowBounds,
  edge: NoteDockEdge,
  revealSize = EDGE_REVEAL_SIZE,
): WindowBounds => {
  if (edge === 'left') {
    return { ...visibleBounds, x: workArea.x, width: revealSize };
  }
  if (edge === 'right') {
    return {
      ...visibleBounds,
      x: workArea.x + workArea.width - revealSize,
      width: revealSize,
    };
  }
  return { ...visibleBounds, y: workArea.y, height: revealSize };
};

/** 计算窗口隐藏后「移出屏幕的那部分」的边界，用于判断外侧是否有相邻显示器。 */
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

/** 判断指定边缘的外侧是否没有其他显示器——只有外边缘悬空时才允许贴边隐藏。 */
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

/**
 * 检测窗口是否满足贴边条件。
 * 按左、右、上的顺序评估各边缘，选择间距最小且外侧悬空的方向返回吸附候选；
 * 如果没有任何边缘满足条件（包括外侧有相邻显示器），返回 null。
 */
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
