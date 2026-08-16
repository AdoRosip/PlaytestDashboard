import { describe, it, expect } from 'vitest';
import type { DrillSelection } from './crossFilter';
import type { FilterState, Question, Response, Tester } from './types';
import {
  selectSegmentTesterIds,
  selectDrillTesterIds,
  selectFilteredTesterIds,
  selectSegmentFilteredResponses,
  selectFilteredResponses,
  selectAnyFilterActive,
  selectCrossFilterCount,
} from './store';

// ─────────────────────────────────────────────────────────────────────────────
// The cohort composition that makes the cross-filter global (feedback items 18
// & 19): the filter panel and the chart cross-filter are two independent
// constraints on the same set of testers, and every page renders their
// intersection.
//
// The pure halves are covered in `filtering.test.ts` and `crossFilter.test.ts`.
// What is exercised here is how `store.ts` composes them — including the
// reference stability the zustand selectors depend on.
// ─────────────────────────────────────────────────────────────────────────────

const noFilters: FilterState = {
  ageGroups: [],
  genders: [],
  continents: [],
  countries: [],
  hardwareTiers: [],
  sessionPlaytime: null,
  playerSentiment: null,
  playedFactorio: false,
  playedSatisfactory: false,
  excludeStraightLiners: false,
  excludeSentimentOutliers: false,
};

function tester(id: string, ageGroup: string, hardware: string): Tester {
  return {
    id,
    testerId: id,
    email: `${id}@example.com`,
    discord: '',
    segments: { hardware_tier: hardware },
    ageGroup,
    country: '',
    gamingProfile: '',
    hardware,
    similarGamesPlayed: [],
    rawProfileJson: {},
  };
}

function question(id: string, categoryId: string): Question {
  return {
    id,
    projectId: 'p',
    text: `Question ${id}`,
    type: 'rating_1_5',
    categoryId,
    sourceColumn: id,
  } as Question;
}

function resp(testerId: string, questionId: string, value: number): Response {
  return {
    id: `${testerId}_${questionId}`,
    projectId: 'p',
    testerId,
    questionId,
    rawAnswer: String(value),
    numericValue: value,
    normalizedScore: null,
    submittedAt: '',
    matchStatus: 'matched',
  };
}

// Two categories, one question each — the shape item 19 is about.
//   catA/Q1 (core loop): t1→2, t2→2, t3→5
//   catB/Q2 (visuals)  : t1→4, t2→1, t3→4
// t1, t2 are on High hardware; t3 is on Low.
const testers = [
  tester('t1', '25-34', 'High'),
  tester('t2', '25-34', 'High'),
  tester('t3', '35-44', 'Low'),
];
const questions = [question('Q1', 'catA'), question('Q2', 'catB')];
const responses = [
  resp('t1', 'Q1', 2), resp('t2', 'Q1', 2), resp('t3', 'Q1', 5),
  resp('t1', 'Q2', 4), resp('t2', 'Q2', 1), resp('t3', 'Q2', 4),
];

/** Minimal state slice; the filter selectors only read these fields. */
function stateWith(filters: FilterState, drill: DrillSelection) {
  return {
    project: null,
    testers,
    questions,
    responses,
    filters,
    drill,
  } as unknown as Parameters<typeof selectFilteredTesterIds>[0];
}

const idsOf = (s: Set<string> | null) => (s === null ? null : [...s].sort());

describe('selectDrillTesterIds', () => {
  it('is null when nothing is selected', () => {
    expect(selectDrillTesterIds(stateWith(noFilters, {}))).toBeNull();
  });

  it('resolves a selection to the testers behind it', () => {
    // "the testers who scored the core loop 2"
    expect(idsOf(selectDrillTesterIds(stateWith(noFilters, { Q1: [2] })))).toEqual(['t1', 't2']);
  });
});

describe('selectFilteredTesterIds — cohort = segment ∩ drill', () => {
  it('is null when neither constraint is active', () => {
    expect(selectFilteredTesterIds(stateWith(noFilters, {}))).toBeNull();
  });

  it('falls through to the drill alone when no panel filter is set', () => {
    expect(idsOf(selectFilteredTesterIds(stateWith(noFilters, { Q1: [2] })))).toEqual(['t1', 't2']);
  });

  it('falls through to the panel alone when nothing is cross-filtered', () => {
    const filters = { ...noFilters, hardwareTiers: ['Low'] };
    expect(idsOf(selectFilteredTesterIds(stateWith(filters, {})))).toEqual(['t3']);
  });

  it('intersects the two — a tester must satisfy both', () => {
    // Q1=2 → t1,t2 ; hardware High → t1,t2 → both
    const high = { ...noFilters, hardwareTiers: ['High'] };
    expect(idsOf(selectFilteredTesterIds(stateWith(high, { Q1: [2] })))).toEqual(['t1', 't2']);

    // Q1=2 → t1,t2 ; hardware Low → t3 → nobody satisfies both
    const low = { ...noFilters, hardwareTiers: ['Low'] };
    expect(idsOf(selectFilteredTesterIds(stateWith(low, { Q1: [2] })))).toEqual([]);
  });
});

describe('cross-category carry-over (item 19)', () => {
  it('narrows another category\'s responses to the selected testers', () => {
    // Select the low core-loop scorers on catA, then read catB.
    const state = stateWith(noFilters, { Q1: [2] });
    const catB = selectFilteredResponses(state).filter((r) => r.questionId === 'Q2');
    expect(catB.map((r) => `${r.testerId}=${r.numericValue}`).sort()).toEqual(['t1=4', 't2=1']);
  });

  it('leaves the segment-filtered view untouched by the drill', () => {
    // This is the base a chart draws itself from, so the bar you just clicked
    // still has neighbours to click next.
    const state = stateWith(noFilters, { Q1: [2] });
    expect(selectSegmentFilteredResponses(state)).toHaveLength(responses.length);
    expect(idsOf(selectSegmentTesterIds(state))).toBeNull();
  });
});

describe('active-filter reporting', () => {
  it('counts cross-filtered questions separately from panel filters', () => {
    expect(selectCrossFilterCount(stateWith(noFilters, {}))).toBe(0);
    expect(selectCrossFilterCount(stateWith(noFilters, { Q1: [2], Q2: [4] }))).toBe(2);
  });

  it('reports activity from either constraint', () => {
    expect(selectAnyFilterActive(stateWith(noFilters, {}))).toBe(false);
    expect(selectAnyFilterActive(stateWith(noFilters, { Q1: [2] }))).toBe(true);
    expect(selectAnyFilterActive(stateWith({ ...noFilters, ageGroups: ['25-34'] }, {}))).toBe(true);
  });
});

describe('reference stability', () => {
  // These selectors are read through `useDashboardStore`, which compares by
  // reference. A fresh Set or array per call would re-render forever.
  it('returns the identical set for an unchanged state', () => {
    const state = stateWith(noFilters, { Q1: [2] });
    expect(selectFilteredTesterIds(state)).toBe(selectFilteredTesterIds(state));
  });

  it('returns the identical response array for an unchanged state', () => {
    const state = stateWith({ ...noFilters, hardwareTiers: ['High'] }, { Q1: [2] });
    expect(selectFilteredResponses(state)).toBe(selectFilteredResponses(state));
    expect(selectSegmentFilteredResponses(state)).toBe(selectSegmentFilteredResponses(state));
  });

  it('recomputes when the drill changes', () => {
    const before = selectFilteredTesterIds(stateWith(noFilters, { Q1: [2] }));
    const after = selectFilteredTesterIds(stateWith(noFilters, { Q1: [5] }));
    expect(idsOf(before)).toEqual(['t1', 't2']);
    expect(idsOf(after)).toEqual(['t3']);
  });
});
