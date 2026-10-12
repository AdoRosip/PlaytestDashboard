import { describe, it, expect } from 'vitest';
import { splitCoreScores, scoreBandColor } from './coreScores';

const cat = (name: string, score: number) => ({ name, score });
const names = (xs: { name: string }[]) => xs.map(x => x.name);

describe('splitCoreScores', () => {
  it('shows every category as a ring when there are 5 or fewer', () => {
    const layout = splitCoreScores([cat('a', 40), cat('b', 90), cat('c', 60)]);
    expect(layout.kind).toBe('row');
    if (layout.kind === 'row') expect(names(layout.all)).toEqual(['b', 'c', 'a']);
    expect(splitCoreScores([1, 2, 3, 4, 5].map(n => cat(`c${n}`, n))).kind).toBe('row');
  });

  it('splits 6+ categories into strongest, weakest (lowest first) and the rest', () => {
    const layout = splitCoreScores([
      cat('mid1', 60), cat('low', 20), cat('top', 95), cat('mid2', 55),
      cat('second', 80), cat('lowish', 35), cat('mid3', 50),
    ]);
    expect(layout.kind).toBe('split');
    if (layout.kind !== 'split') return;
    expect(names(layout.strongest)).toEqual(['top', 'second']);
    expect(names(layout.weakest)).toEqual(['low', 'lowish']);
    expect(names(layout.rest)).toEqual(['mid1', 'mid2', 'mid3']);
  });

  it('does not mutate the input', () => {
    const input = [cat('a', 1), cat('b', 2)];
    splitCoreScores(input);
    expect(names(input)).toEqual(['a', 'b']);
  });
});

describe('scoreBandColor', () => {
  it('maps band edges', () => {
    expect(scoreBandColor(70)).toBe('#7ED957');
    expect(scoreBandColor(69)).toBe('#E8C547');
    expect(scoreBandColor(50)).toBe('#E8C547');
    expect(scoreBandColor(49)).toBe('#F26D6D');
  });
});
