export const APP_NAME = '悬浮便利贴';
export const DEFAULT_NOTE_WIDTH = 320;
export const DEFAULT_NOTE_HEIGHT = 400;
export const MIN_NOTE_WIDTH = 280;
export const MIN_NOTE_HEIGHT = 280;

export const DEFAULT_CONFIG = {
  schema_version: 1,
  cleanup_time: '00:00',
  agent: 'template',
  template_path: null,
  always_on_top: true,
  window_bounds: null,
  completed_expanded: false,
} as const;
