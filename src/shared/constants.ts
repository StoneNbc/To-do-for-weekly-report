/** 窗口、产品名和默认配置的单一事实来源。 */
export const APP_NAME = '悬浮便利贴';
export const DEFAULT_NOTE_WIDTH = 320;
export const DEFAULT_NOTE_HEIGHT = 400;
export const MIN_NOTE_WIDTH = 280;
export const MIN_NOTE_HEIGHT = 280;
export const DEFAULT_NOTE_COLOR = '#FFF8E7';
export const DEFAULT_NOTE_OPACITY = 1;
export const MIN_NOTE_OPACITY = 0.6;
export const NOTE_OPACITY_STEP = 0.05;

export const DEFAULT_CONFIG = {
  schema_version: 1,
  cleanup_time: '00:00',
  agent: 'template',
  template_path: null,
  always_on_top: true,
  window_bounds: null,
  completed_expanded: false,
  note_color: DEFAULT_NOTE_COLOR,
  note_opacity: DEFAULT_NOTE_OPACITY,
} as const;
