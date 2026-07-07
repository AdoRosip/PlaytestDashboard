import { describe, it, expect } from 'vitest';
import type { Question, Response, Tester } from './types';
import { wannabeTrashmanConfig } from './games';
import { splitMulti, genreFit, engagement } from './testerProfile';

function tester(over: Partial<Tester> = {}): Tester {
  return {
    id: 't1', testerId: 't1', email: '', discord: '', segments: {},
    ageGroup: '', country: '', gamingProfile: '', hardware: '',
    similarGamesPlayed: [], rawProfileJson: {}, ...over,
  };
}
function q(id: string, type: Question['type']): Question {
  return { id, projectId: 'p', text: id, type, categoryId: null, sourceColumn: id };
}
function resp(testerId: string, questionId: string, rawAnswer: string): Response {
  return { id: `${testerId}_${questionId}`, projectId: 'p', testerId, questionId, rawAnswer, numericValue: null, normalizedScore: null, submittedAt: '', matchStatus: 'matched' };
}

describe('splitMulti', () => {
  it('splits and trims comma-joined values', () => {
    expect(splitMulti('RPG, Strategy ,  Horror')).toEqual(['RPG', 'Strategy', 'Horror']);
    expect(splitMulti('')).toEqual([]);
    expect(splitMulti(undefined)).toEqual([]);
  });
});

describe('genreFit', () => {
  it('matches target genres against the raw genres string incl. parentheticals', () => {
    const t = tester({ segments: { genres: 'Shooters (FPS / TPS), Simulation / Cozy (e.g. House Flipper, PowerWash Sim), Survival / Crafting' } });
    const fit = genreFit(t, wannabeTrashmanConfig);
    expect(fit.matched.sort()).toEqual(['Simulation / Cozy', 'Survival / Crafting']);
    expect(fit.isFit).toBe(true);
    expect(fit.score).toBeCloseTo(2 / 3);
    expect(fit.unknown).toBe(false);
  });

  it('flags no fit when the tester plays none of the target genres', () => {
    const t = tester({ segments: { genres: 'Fighting, Racing / Sports' } });
    const fit = genreFit(t, wannabeTrashmanConfig);
    expect(fit.matched).toEqual([]);
    expect(fit.isFit).toBe(false);
  });

  it('marks unknown when the tester has no genre data', () => {
    const fit = genreFit(tester(), wannabeTrashmanConfig);
    expect(fit.unknown).toBe(true);
    expect(fit.isFit).toBe(false);
  });
});

describe('engagement', () => {
  const questions = [q('a', 'free_text'), q('b', 'free_text'), q('c', 'free_text'), q('d', 'rating_1_5')];

  it('rates a thorough tester as detailed', () => {
    const long = 'This is a genuinely detailed answer with plenty of specific words describing the experience in depth here';
    const rs = [resp('t1', 'a', long), resp('t1', 'b', long), resp('t1', 'c', long)];
    const e = engagement('t1', rs, questions);
    expect(e.freeTextTotal).toBe(3);
    expect(e.answered).toBe(3);
    expect(e.tier).toBe('detailed');
  });

  it('ignores non-substantive answers like "no"', () => {
    const rs = [resp('t1', 'a', 'no'), resp('t1', 'b', 'n/a'), resp('t1', 'c', '')];
    const e = engagement('t1', rs, questions);
    expect(e.answered).toBe(0);
    expect(e.tier).toBe('none');
  });

  it('rates short-but-present answers as minimal/brief, not detailed', () => {
    const rs = [resp('t1', 'a', 'it was fun'), resp('t1', 'b', 'good game')];
    const e = engagement('t1', rs, questions);
    expect(e.answered).toBe(2);
    expect(e.tier).not.toBe('detailed');
  });
});
