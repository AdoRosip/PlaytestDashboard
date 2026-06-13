import { describe, it, expect } from 'vitest';
import type { FilterState, Question, Response, Tester } from './types';
import {
  computeFilteredTesterIds,
  filterResponsesByTesterIds,
  filterTestersByIds,
  hasActiveFilters,
  countActiveFilters,
} from './filtering';

// ─── Fixture builders ────────────────────────────────────────────────────────

function tester(id: string, overrides: Partial<Tester> = {}): Tester {
  return {
    id,
    testerId: id,
    email: '',
    discord: '',
    segments: {},
    ageGroup: '',
    country: '',
    gamingProfile: '',
    hardware: '',
    similarGamesPlayed: [],
    rawProfileJson: {},
    ...overrides,
  };
}

function question(id: string, text: string, overrides: Partial<Question> = {}): Question {
  return {
    id,
    projectId: 'p',
    text,
    type: 'rating_1_5',
    categoryId: null,
    sourceColumn: id,
    ...overrides,
  };
}

function response(testerId: string | null, questionId: string, overrides: Partial<Response> = {}): Response {
  return {
    id: `${testerId}_${questionId}_${Math.random()}`,
    projectId: 'p',
    testerId,
    questionId,
    rawAnswer: '',
    numericValue: null,
    normalizedScore: null,
    submittedAt: '',
    matchStatus: 'matched',
    ...overrides,
  };
}

const noFilters: FilterState = {
  ageGroups: [],
  genders: [],
  countries: [],
  hardwareTiers: [],
  sessionPlaytime: null,
  playedFactorio: false,
  playedSatisfactory: false,
};

const f = (patch: Partial<FilterState>): FilterState => ({ ...noFilters, ...patch });

function ids(input: ReturnType<typeof computeFilteredTesterIds>): string[] {
  return input === null ? [] : [...input].sort();
}

// ─── hasActiveFilters / countActiveFilters ───────────────────────────────────

describe('hasActiveFilters', () => {
  it('is false for the empty filter state', () => {
    expect(hasActiveFilters(noFilters)).toBe(false);
  });

  it('is true when any single dimension is set', () => {
    expect(hasActiveFilters(f({ ageGroups: ['25-34'] }))).toBe(true);
    expect(hasActiveFilters(f({ sessionPlaytime: '1-3h' }))).toBe(true);
    expect(hasActiveFilters(f({ playedFactorio: true }))).toBe(true);
  });
});

describe('countActiveFilters', () => {
  it('counts each selected value plus each toggle', () => {
    expect(countActiveFilters(noFilters)).toBe(0);
    expect(
      countActiveFilters(
        f({ ageGroups: ['18-24', '25-34'], countries: ['Germany'], sessionPlaytime: '6h+', playedFactorio: true }),
      ),
    ).toBe(2 + 1 + 1 + 1);
  });
});

// ─── computeFilteredTesterIds ────────────────────────────────────────────────

describe('computeFilteredTesterIds', () => {
  it('returns null (no filtering) when no filter is active', () => {
    const testers = [tester('a'), tester('b')];
    expect(computeFilteredTesterIds({ testers, responses: [], questions: [], filters: noFilters })).toBeNull();
  });

  it('matches age group with OR semantics within the dimension', () => {
    const testers = [
      tester('a', { ageGroup: '18-24' }),
      tester('b', { ageGroup: '25-34' }),
      tester('c', { ageGroup: '35-44' }),
    ];
    const result = computeFilteredTesterIds({
      testers, responses: [], questions: [], filters: f({ ageGroups: ['18-24', '25-34'] }),
    });
    expect(ids(result)).toEqual(['a', 'b']);
  });

  it('uses tester.country, falling back to segments.country', () => {
    const testers = [
      tester('a', { country: 'Germany' }),
      tester('b', { segments: { country: 'Germany' } }),
      tester('c', { country: 'France' }),
    ];
    const result = computeFilteredTesterIds({
      testers, responses: [], questions: [], filters: f({ countries: ['Germany'] }),
    });
    expect(ids(result)).toEqual(['a', 'b']);
  });

  it('treats a missing hardware tier as "Unknown"', () => {
    const testers = [
      tester('a', { segments: { hardware_tier: 'High' } }),
      tester('b', {}), // no hardware tier → Unknown
    ];
    expect(
      ids(computeFilteredTesterIds({ testers, responses: [], questions: [], filters: f({ hardwareTiers: ['Unknown'] }) })),
    ).toEqual(['b']);
    expect(
      ids(computeFilteredTesterIds({ testers, responses: [], questions: [], filters: f({ hardwareTiers: ['High'] }) })),
    ).toEqual(['a']);
  });

  it('excludes testers with no gender when a gender filter is active', () => {
    const testers = [
      tester('a', { segments: { gender: 'Male' } }),
      tester('b', {}), // no gender
    ];
    expect(
      ids(computeFilteredTesterIds({ testers, responses: [], questions: [], filters: f({ genders: ['Male'] }) })),
    ).toEqual(['a']);
  });

  it('AND-combines dimensions: a tester must satisfy every active dimension', () => {
    const testers = [
      tester('a', { ageGroup: '25-34', country: 'Germany' }),
      tester('b', { ageGroup: '25-34', country: 'France' }),
      tester('c', { ageGroup: '18-24', country: 'Germany' }),
    ];
    const result = computeFilteredTesterIds({
      testers, responses: [], questions: [],
      filters: f({ ageGroups: ['25-34'], countries: ['Germany'] }),
    });
    expect(ids(result)).toEqual(['a']);
  });

  describe('session playtime', () => {
    const q = question('q_play', 'Approximately how many hours did you play?');
    const testers = [
      tester('a'), tester('b'), tester('c'), tester('d'), tester('e'),
    ];
    const responses = [
      response('a', 'q_play', { numericValue: 0.5 }),
      response('b', 'q_play', { numericValue: 1 }),   // boundary: 1-3h (inclusive lower)
      response('c', 'q_play', { numericValue: 3 }),   // boundary: 1-3h (inclusive upper)
      response('d', 'q_play', { numericValue: 6 }),   // boundary: 3-6h (inclusive upper)
      response('e', 'q_play', { numericValue: 7 }),
    ];

    it('buckets numeric playtime at the correct boundaries', () => {
      const run = (bucket: FilterState['sessionPlaytime']) =>
        ids(computeFilteredTesterIds({ testers, responses, questions: [q], filters: f({ sessionPlaytime: bucket }) }));
      expect(run('<1h')).toEqual(['a']);
      expect(run('1-3h')).toEqual(['b', 'c']);
      expect(run('3-6h')).toEqual(['d']);
      expect(run('6h+')).toEqual(['e']);
    });

    it('drops testers whose playtime answer is non-numeric or absent', () => {
      // "3h 10m" style answers parse to numericValue null and are silently excluded.
      const t = [tester('x'), tester('y')];
      const r = [
        response('x', 'q_play', { rawAnswer: '3h 10m', numericValue: null }),
        // y did not answer the playtime question at all
        response('y', 'q_other', { numericValue: 5 }),
      ];
      const result = computeFilteredTesterIds({ testers: t, responses: r, questions: [q], filters: f({ sessionPlaytime: '3-6h' }) });
      expect(ids(result)).toEqual([]);
    });
  });

  describe('played-game background filter', () => {
    // Question must live in cat_01 to be recognised.
    const fq = question('q_fac', 'How many hours do you have on Factorio?', { categoryId: 'cat_01' });

    it('includes testers with a positive numeric answer and excludes 0/no/none', () => {
      const testers = [tester('a'), tester('b'), tester('c'), tester('d')];
      const responses = [
        response('a', 'q_fac', { numericValue: 120 }),
        response('b', 'q_fac', { rawAnswer: 'yes', numericValue: null }),
        response('c', 'q_fac', { rawAnswer: 'no', numericValue: null }),
        response('d', 'q_fac', { rawAnswer: '0', numericValue: 0 }),
      ];
      const result = computeFilteredTesterIds({ testers, responses, questions: [fq], filters: f({ playedFactorio: true }) });
      expect(ids(result)).toEqual(['a', 'b']);
    });

    it('matches nobody when the background question is not in cat_01', () => {
      const wrongCat = question('q_fac', 'How many hours do you have on Factorio?', { categoryId: 'cat_99' });
      const testers = [tester('a')];
      const responses = [response('a', 'q_fac', { numericValue: 120 })];
      const result = computeFilteredTesterIds({ testers, responses, questions: [wrongCat], filters: f({ playedFactorio: true }) });
      expect(ids(result)).toEqual([]);
    });
  });
});

// ─── filterResponsesByTesterIds / filterTestersByIds ─────────────────────────

describe('filterResponsesByTesterIds', () => {
  const responses = [
    response('a', 'q1'),
    response('b', 'q1'),
    response(null, 'q1'), // unattributed response
  ];

  it('returns all responses unchanged when ids is null', () => {
    expect(filterResponsesByTesterIds(responses, null)).toBe(responses);
  });

  it('keeps matching testers and always keeps null-tester responses', () => {
    const kept = filterResponsesByTesterIds(responses, new Set(['a']));
    expect(kept.map((r) => r.testerId)).toEqual(['a', null]);
  });
});

describe('filterTestersByIds', () => {
  const testers = [tester('a'), tester('b'), tester('c')];

  it('returns all testers when ids is null', () => {
    expect(filterTestersByIds(testers, null)).toBe(testers);
  });

  it('keeps only testers in the id set', () => {
    expect(filterTestersByIds(testers, new Set(['a', 'c'])).map((t) => t.id)).toEqual(['a', 'c']);
  });
});
