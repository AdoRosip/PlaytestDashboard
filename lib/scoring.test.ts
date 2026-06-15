import { describe, it, expect } from 'vitest';
import { computeNormalizedScore, scaleForType, isRatingType } from './scoring';

describe('computeNormalizedScore', () => {
  const r5 = { scaleMin: 1, scaleMax: 5 };
  const r10 = { scaleMin: 1, scaleMax: 10 };

  it('normalizes a 1–5 rating linearly', () => {
    expect(computeNormalizedScore(r5, 1)).toBe(0);
    expect(computeNormalizedScore(r5, 3)).toBe(50);
    expect(computeNormalizedScore(r5, 5)).toBe(100);
  });

  it('normalizes a 1–10 rating linearly', () => {
    expect(computeNormalizedScore(r10, 1)).toBe(0);
    expect(computeNormalizedScore(r10, 10)).toBe(100);
  });

  it('inverts negative-valence questions ("higher answer = worse")', () => {
    expect(computeNormalizedScore({ ...r5, isInverseScored: true }, 5)).toBe(0);
    expect(computeNormalizedScore({ ...r5, isInverseScored: true }, 1)).toBe(100);
    expect(computeNormalizedScore({ ...r5, isInverseScored: true }, 3)).toBe(50);
  });

  it('clamps out-of-range answers to 0–100', () => {
    expect(computeNormalizedScore(r5, 6)).toBe(100);
    expect(computeNormalizedScore(r5, 0)).toBe(0);
    expect(computeNormalizedScore({ ...r5, isInverseScored: true }, 6)).toBe(0);
  });

  it('returns null when there is no numeric value or no scale', () => {
    expect(computeNormalizedScore(r5, null)).toBeNull();
    expect(computeNormalizedScore({}, 3)).toBeNull();
    expect(computeNormalizedScore({ scaleMin: 3, scaleMax: 3 }, 3)).toBeNull();
  });
});

describe('scaleForType / isRatingType', () => {
  it('maps rating types to their scale', () => {
    expect(scaleForType('rating_1_5')).toEqual({ scaleMin: 1, scaleMax: 5 });
    expect(scaleForType('rating_1_10')).toEqual({ scaleMin: 1, scaleMax: 10 });
  });

  it('clears the scale for non-rating types', () => {
    expect(scaleForType('free_text')).toEqual({ scaleMin: undefined, scaleMax: undefined });
    expect(scaleForType('yes_no')).toEqual({ scaleMin: undefined, scaleMax: undefined });
  });

  it('identifies rating types', () => {
    expect(isRatingType('rating_1_5')).toBe(true);
    expect(isRatingType('rating_1_10')).toBe(true);
    expect(isRatingType('multiple_choice')).toBe(false);
  });
});
