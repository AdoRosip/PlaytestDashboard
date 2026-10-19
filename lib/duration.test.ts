import { describe, expect, it } from 'vitest';
import type { Question } from './types';
import { durationDistribution, findPlaytimeQuestion, formatDurationMinutes, parseDurationMinutes, playtimeHours } from './duration';

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

describe('playtime question', () => {
  const q = (id: string, text: string, type: Question['type']): Question =>
    ({ id, projectId: 'p', text, type, categoryId: null, sourceColumn: id });
  const hoursQ = q('h', 'How many hours did you play this session?', 'rating_1_10');
  const durationQ = q('d', 'Roughly how long did you play in total?', 'duration');

  it('prefers the Duration question over a text match', () => {
    expect(findPlaytimeQuestion([hoursQ, durationQ], /how many hours/i)).toBe(durationQ);
    expect(findPlaytimeQuestion([hoursQ], /how many hours/i)).toBe(hoursQ);
    expect(findPlaytimeQuestion([hoursQ])).toBeUndefined();
  });
  it('converts Duration minutes to hours and keeps other answers as hours', () => {
    expect(playtimeHours(durationQ, { rawAnswer: '90', numericValue: null })).toBe(1.5);
    expect(playtimeHours(durationQ, { rawAnswer: '', numericValue: null })).toBeNull();
    expect(playtimeHours(hoursQ, { rawAnswer: '4', numericValue: 4 })).toBe(4);
  });
});

describe('durationDistribution', () => {
  it('counts parsed answers per band and skips unparseable ones', () => {
    const answers = ['45', '180', '320', '540', '600', ''].map((rawAnswer) => ({ rawAnswer }));
    expect(durationDistribution(answers)).toEqual([
      { label: '< 1h', count: 1, pct: 20 },
      { label: '1–3h', count: 1, pct: 20 },
      { label: '3–6h', count: 1, pct: 20 },
      { label: '6h+', count: 2, pct: 40 },
    ]);
  });
});
