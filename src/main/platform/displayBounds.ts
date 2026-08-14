import type { WindowBounds } from '../../shared/domain';

export interface DisplayArea {
  workArea: WindowBounds;
  primary?: boolean;
}

const MIN_VISIBLE_WIDTH = 80;
const MIN_VISIBLE_HEIGHT = 60;
const DEFAULT_MARGIN = 24;

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(Math.max(value, minimum), maximum);

const intersectionSize = (
  left: WindowBounds,
  right: WindowBounds,
): { width: number; height: number } => {
  const width = Math.max(
    0,
    Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x),
  );
  const height = Math.max(
    0,
    Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y),
  );
  return { width, height };
};

export const isBoundsVisible = (bounds: WindowBounds, displays: readonly DisplayArea[]): boolean =>
  displays.some(({ workArea }) => {
    const intersection = intersectionSize(bounds, workArea);
    return (
      intersection.width >= Math.min(MIN_VISIBLE_WIDTH, bounds.width) &&
      intersection.height >= Math.min(MIN_VISIBLE_HEIGHT, bounds.height)
    );
  });

export interface RestoreBoundsOptions {
  saved: WindowBounds | null;
  displays: readonly DisplayArea[];
  defaults: Pick<WindowBounds, 'width' | 'height'>;
  minimum: Pick<WindowBounds, 'width' | 'height'>;
  margin?: number;
}

/**
 * 显示器移除或分辨率变化后，确保保存的窗口位置仍可操作。
 * 只要窗口仍有足够区域可见，就保留用户有意放在屏幕边缘的布局。
 */
export const restoreVisibleBounds = ({
  saved,
  displays,
  defaults,
  minimum,
  margin = DEFAULT_MARGIN,
}: RestoreBoundsOptions): WindowBounds => {
  const fallbackArea = displays.find((display) => display.primary)?.workArea ??
    displays[0]?.workArea ?? {
      x: 0,
      y: 0,
      width: Math.max(defaults.width, minimum.width),
      height: Math.max(defaults.height, minimum.height),
    };

  const requestedWidth = saved?.width ?? defaults.width;
  const requestedHeight = saved?.height ?? defaults.height;
  const width = clamp(
    requestedWidth,
    Math.min(minimum.width, fallbackArea.width),
    fallbackArea.width,
  );
  const height = clamp(
    requestedHeight,
    Math.min(minimum.height, fallbackArea.height),
    fallbackArea.height,
  );
  const candidate: WindowBounds = {
    x: saved?.x ?? fallbackArea.x + fallbackArea.width - width - margin,
    y: saved?.y ?? fallbackArea.y + margin,
    width,
    height,
  };

  if (saved && isBoundsVisible(candidate, displays)) {
    // 不强制吸附完全可见，尊重用户把便利贴部分移出屏幕的摆放习惯。
    return candidate;
  }

  return {
    x: clamp(
      fallbackArea.x + fallbackArea.width - width - margin,
      fallbackArea.x,
      fallbackArea.x + fallbackArea.width - width,
    ),
    y: clamp(
      fallbackArea.y + margin,
      fallbackArea.y,
      fallbackArea.y + fallbackArea.height - height,
    ),
    width,
    height,
  };
};
