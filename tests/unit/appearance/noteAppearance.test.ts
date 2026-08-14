import { describe, expect, it } from 'vitest';
import {
  getNoteTheme,
  isValidNoteColor,
  isValidNoteOpacity,
  normalizeNoteColor,
  sanitizeNoteColor,
  sanitizeNoteOpacity,
} from '../../../src/shared/noteAppearance';

describe('note appearance contracts', () => {
  it('normalizes and validates six-digit colors', () => {
    expect(normalizeNoteColor(' #fce7f3 ')).toBe('#FCE7F3');
    expect(isValidNoteColor('#FCE7F3')).toBe(true);
    expect(isValidNoteColor('#fff')).toBe(false);
    expect(isValidNoteColor('#FFF8E7FF')).toBe(false);
    expect(sanitizeNoteColor('invalid')).toBe('#FFF8E7');
  });

  it('accepts opacity only from 60% to 100% in 5% steps', () => {
    expect(isValidNoteOpacity(0.6)).toBe(true);
    expect(isValidNoteOpacity(0.85)).toBe(true);
    expect(isValidNoteOpacity(1)).toBe(true);
    expect(isValidNoteOpacity(0.59)).toBe(false);
    expect(isValidNoteOpacity(0.83)).toBe(false);
    expect(isValidNoteOpacity(Number.NaN)).toBe(false);
    expect(sanitizeNoteOpacity(0.2)).toBe(1);
  });

  it('selects readable foreground tokens for light and dark custom colors', () => {
    expect(getNoteTheme('#FFF8E7').foreground).toBe('#292524');
    expect(getNoteTheme('#111827').foreground).toBe('#FAFAF9');
  });
});
