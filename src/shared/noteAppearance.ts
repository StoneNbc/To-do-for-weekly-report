import {
  DEFAULT_NOTE_COLOR,
  DEFAULT_NOTE_OPACITY,
  MIN_NOTE_OPACITY,
  NOTE_OPACITY_STEP,
} from './constants';

const NOTE_COLOR_PATTERN = /^#[0-9A-F]{6}$/;
const EPSILON = 1e-9;

export interface NoteTheme {
  foreground: string;
  muted: string;
  faint: string;
  surface: string;
  surfaceStrong: string;
  border: string;
  accent: string;
  focus: string;
}

export const normalizeNoteColor = (value: string): string => value.trim().toUpperCase();

export const isValidNoteColor = (value: unknown): value is string =>
  typeof value === 'string' && NOTE_COLOR_PATTERN.test(normalizeNoteColor(value));

export const isValidNoteOpacity = (value: unknown): value is number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  if (value < MIN_NOTE_OPACITY || value > 1) return false;
  const steps = (value - MIN_NOTE_OPACITY) / NOTE_OPACITY_STEP;
  return Math.abs(steps - Math.round(steps)) < EPSILON;
};

export const sanitizeNoteColor = (value: unknown): string =>
  isValidNoteColor(value) ? normalizeNoteColor(value) : DEFAULT_NOTE_COLOR;

export const sanitizeNoteOpacity = (value: unknown): number =>
  isValidNoteOpacity(value) ? value : DEFAULT_NOTE_OPACITY;

const relativeLuminance = (color: string): number => {
  const normalized = normalizeNoteColor(color);
  const channels = [1, 3, 5].map(
    (offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16) / 255,
  );
  const [red = 0, green = 0, blue = 0] = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};

/** 自定义背景在深浅前景中选择对比度更高的一组便利贴设计令牌。 */
export const getNoteTheme = (color: string): NoteTheme => {
  const luminance = relativeLuminance(sanitizeNoteColor(color));
  const contrastWithDark = (luminance + 0.05) / 0.05;
  const contrastWithLight = 1.05 / (luminance + 0.05);
  const darkForeground = contrastWithDark >= contrastWithLight;

  return darkForeground
    ? {
        foreground: '#292524',
        muted: '#57534E',
        faint: '#78716C',
        surface: 'rgba(255, 255, 255, 0.35)',
        surfaceStrong: 'rgba(255, 255, 255, 0.82)',
        border: 'rgba(120, 53, 15, 0.16)',
        accent: '#92400E',
        focus: '#D97706',
      }
    : {
        foreground: '#FAFAF9',
        muted: '#E7E5E4',
        faint: '#D6D3D1',
        surface: 'rgba(255, 255, 255, 0.14)',
        surfaceStrong: 'rgba(28, 25, 23, 0.82)',
        border: 'rgba(255, 255, 255, 0.28)',
        accent: '#FDE68A',
        focus: '#FCD34D',
      };
};
