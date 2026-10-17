import { describe, expect, it } from 'vitest';
import { formatDurationMinutes, parseDurationMinutes } from './duration';

describe('Portal duration minutes', () => {
  it('reads numeric minutes including zero and fractions', () => {
    expect(parseDurationMinutes('320')).toBe(320);
    expect(parseDurationMinutes(' 90.5 ')).toBe(90.5);
    expect(parseDurationMinutes('0')).toBe(0);
  });
  it('excludes missing, negative and malformed answers', () => {
    for (const value of ['', ' ', '-10', 'NaN', 'Infinity', '1:30', 'unknown']) {
      expect(parseDurationMinutes(value)).toBeNull();
    }
  });
  it('formats minutes as readable hours and minutes, carrying rounded minutes', () => {
    expect(formatDurationMinutes(320)).toBe('5h 20m');
    expect(formatDurationMinutes(45)).toBe('45m');
    expect(formatDurationMinutes(119.9)).toBe('2h');
    expect(formatDurationMinutes(0)).toBe('0m');
  });
});
