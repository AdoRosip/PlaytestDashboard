import { describe, it, expect } from 'vitest';
import { distributionOf, classifyLead, semiStructured, ratingDistribution, ratingSentiment } from './qualitative';

describe('distributionOf', () => {
  it('counts and sorts choice answers', () => {
    const d = distributionOf(['Yes', 'Yes', 'Maybe', 'No', 'Yes', '']);
    expect(d[0]).toEqual({ label: 'Yes', count: 3, pct: 60 });
    expect(d.find((b) => b.label === 'Maybe')!.count).toBe(1);
  });
});

describe('classifyLead', () => {
  it('reads leading sentiment, checking maybe before no', () => {
    expect(classifyLead('yes, its easy to follow')).toBe('yes');
    expect(classifyLead('no, it was clear')).toBe('no');
    expect(classifyLead('maybe, because it can get boring')).toBe('maybe');
    expect(classifyLead('not sure honestly')).toBe('maybe'); // "not sure" → maybe, not no
    expect(classifyLead('The garbage truck event was great')).toBe('other');
    expect(classifyLead('')).toBe('other');
  });
});

describe('semiStructured', () => {
  it('aggregates yes/no/maybe and reports classified ratio', () => {
    const s = semiStructured(['yes, fun', 'no', 'maybe later', 'The lockpicking felt off', '']);
    expect(s.yes).toBe(1);
    expect(s.no).toBe(1);
    expect(s.maybe).toBe(1);
    expect(s.other).toBe(1);
    expect(s.total).toBe(4);
    expect(s.classifiedRatio).toBeCloseTo(3 / 4);
  });
});

describe('ratingDistribution', () => {
  it('buckets 1..max', () => {
    const d = ratingDistribution([1, 3, 3, 4, 5], 5);
    expect(d).toHaveLength(5);
    expect(d[2]).toEqual({ value: 3, count: 2, pct: 40 });
  });
});

describe('ratingSentiment', () => {
  it('splits positive/neutral/negative by share of max', () => {
    const s = ratingSentiment([5, 4, 3, 2, 1], 5)!;
    expect(s.n).toBe(5);
    expect(s.avg).toBe(3);
    // >=3.0 positive (0.6*5), <1.75 negative (0.35*5)
    expect(s.positive).toBe(60); // 5,4,3
    expect(s.negative).toBe(20); // 1
  });
  it('returns null for no data', () => {
    expect(ratingSentiment([], 5)).toBeNull();
  });
});
