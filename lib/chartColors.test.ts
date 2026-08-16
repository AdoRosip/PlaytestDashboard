import { describe, it, expect } from 'vitest';
import { rampColor, ratingColors, scoreHex, POLARITY } from './chartColors';

const RAMP_5 = [
  'hsl(0, 72%, 55%)',   // red
  'hsl(30, 72%, 55%)',  // orange
  'hsl(60, 72%, 55%)',  // yellow
  'hsl(90, 72%, 55%)',  // lime
  'hsl(120, 72%, 55%)', // green
];

describe('rampColor', () => {
  it('runs red -> yellow -> green', () => {
    expect(ratingColors(5)).toEqual(RAMP_5);
    expect(POLARITY.bad).toBe('hsl(0, 72%, 55%)');
    expect(POLARITY.neutral).toBe('hsl(60, 72%, 55%)');
    expect(POLARITY.good).toBe('hsl(120, 72%, 55%)');
  });

  it('spans the full hue range on a 10-point scale', () => {
    const ten = ratingColors(10);
    expect(ten).toHaveLength(10);
    expect(ten[0]).toBe(POLARITY.bad);
    expect(ten[9]).toBe(POLARITY.good);
  });

  it('clamps out-of-range positions instead of producing garbage', () => {
    expect(rampColor(-3)).toBe(POLARITY.bad);
    expect(rampColor(99)).toBe(POLARITY.good);
  });
});

describe('ratingColors with isInverseScored', () => {
  it('flips the ramp so green always means good', () => {
    // On a negative-valence question ("how frustrated were you?") a 1 is the
    // good answer, so bar 1 must be green and bar 5 red.
    expect(ratingColors(5, true)).toEqual([...RAMP_5].reverse());
    expect(ratingColors(10, true)).toEqual([...ratingColors(10)].reverse());
  });

  it('defaults to the un-flipped ramp', () => {
    expect(ratingColors(5)).toEqual(ratingColors(5, false));
  });
});

describe('scoreHex', () => {
  it('maps normalized scores to the poles and midpoint', () => {
    // normalizedScore is always higher-is-better, so no flip is applied here.
    expect(scoreHex(0)).toBe(POLARITY.bad);
    expect(scoreHex(50)).toBe(POLARITY.neutral);
    expect(scoreHex(100)).toBe(POLARITY.good);
  });
});
