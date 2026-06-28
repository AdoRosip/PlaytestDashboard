import { describe, it, expect } from 'vitest';
import type { Response } from './types';
import {
  buildPerQuestionSets,
  matchingTesterIds,
  applyDrill,
  toggleDrill,
  removeDrill,
  type DrillSelection,
} from './crossFilter';

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** One rating response: tester `t` answered `value` on question `q`. */
function resp(
  t: string | null,
  q: string,
  value: number | null,
  overrides: Partial<Response> = {},
): Response {
  return {
    id: `${t}_${q}`,
    projectId: 'p',
    testerId: t,
    questionId: q,
    rawAnswer: value === null ? '' : String(value),
    numericValue: value,
    normalizedScore: null,
    submittedAt: '',
    matchStatus: 'matched',
    ...overrides,
  };
}

// A small 3-tester, 2-question world:
//   Q1: t1→5, t2→5, t3→3
//   Q2: t1→4, t2→2, t3→4
const world: Response[] = [
  resp('t1', 'Q1', 5),
  resp('t2', 'Q1', 5),
  resp('t3', 'Q1', 3),
  resp('t1', 'Q2', 4),
  resp('t2', 'Q2', 2),
  resp('t3', 'Q2', 4),
];

const idsOf = (s: Set<string> | null) => (s === null ? null : [...s].sort());

// ─── buildPerQuestionSets ────────────────────────────────────────────────────

describe('buildPerQuestionSets', () => {
  it('collects the testers who gave the selected rating on each question', () => {
    const sets = buildPerQuestionSets(world, { Q1: 5 });
    expect(idsOf(sets.get('Q1')!)).toEqual(['t1', 't2']);
  });

  it('returns an empty map when nothing is drilled', () => {
    expect(buildPerQuestionSets(world, {}).size).toBe(0);
  });

  it('yields an empty set when no tester matches the selected value', () => {
    const sets = buildPerQuestionSets(world, { Q1: 1 });
    expect(sets.get('Q1')!.size).toBe(0);
  });

  it('rounds numericValue to match the bar-chart bucket', () => {
    // 4.5 lives in the "5" bar, 4.4 lives in the "4" bar.
    const data = [resp('t1', 'Q1', 4.5), resp('t2', 'Q1', 4.4)];
    expect(idsOf(buildPerQuestionSets(data, { Q1: 5 }).get('Q1')!)).toEqual(['t1']);
    expect(idsOf(buildPerQuestionSets(data, { Q1: 4 }).get('Q1')!)).toEqual(['t2']);
  });

  it('ignores responses with no testerId or no numericValue', () => {
    const data = [
      resp(null, 'Q1', 5),
      resp('t1', 'Q1', null, { rawAnswer: 'n/a' }),
      resp('t2', 'Q1', 5),
    ];
    expect(idsOf(buildPerQuestionSets(data, { Q1: 5 }).get('Q1')!)).toEqual(['t2']);
  });
});

// ─── matchingTesterIds ───────────────────────────────────────────────────────

describe('matchingTesterIds', () => {
  it('returns the single set when one question is drilled', () => {
    const sets = buildPerQuestionSets(world, { Q1: 5 });
    expect(idsOf(matchingTesterIds(sets))).toEqual(['t1', 't2']);
  });

  it('intersects (ANDs) selections across questions', () => {
    // gave 5 on Q1 (t1,t2) AND 4 on Q2 (t1,t3) → t1
    const sets = buildPerQuestionSets(world, { Q1: 5, Q2: 4 });
    expect(idsOf(matchingTesterIds(sets))).toEqual(['t1']);
  });

  it('returns null when nothing is drilled (no filter)', () => {
    expect(matchingTesterIds(buildPerQuestionSets(world, {}))).toBeNull();
  });

  it('excludes a question so its own chart sees only the other selections', () => {
    const sets = buildPerQuestionSets(world, { Q1: 5, Q2: 4 });
    // Excluding Q2 → constrained only by Q1=5 → t1,t2
    expect(idsOf(matchingTesterIds(sets, 'Q2'))).toEqual(['t1', 't2']);
  });

  it('returns null when the only drilled question is the excluded one', () => {
    const sets = buildPerQuestionSets(world, { Q1: 5 });
    expect(matchingTesterIds(sets, 'Q1')).toBeNull();
  });

  it('can produce an empty intersection (no common testers)', () => {
    const sets = buildPerQuestionSets(world, { Q1: 3, Q2: 4 });
    // Q1=3 → t3; Q2=4 → t1,t3 → intersection t3
    expect(idsOf(matchingTesterIds(sets))).toEqual(['t3']);
    const none = buildPerQuestionSets(world, { Q1: 5, Q2: 2 });
    // Q1=5 → t1,t2; Q2=2 → t2 → t2
    expect(idsOf(matchingTesterIds(none))).toEqual(['t2']);
  });
});

// ─── applyDrill ──────────────────────────────────────────────────────────────

describe('applyDrill', () => {
  it('returns the list unchanged when ids is null', () => {
    const q2 = world.filter((r) => r.questionId === 'Q2');
    expect(applyDrill(q2, null)).toEqual(q2);
  });

  it('keeps only responses from testers in the set', () => {
    const ids = matchingTesterIds(buildPerQuestionSets(world, { Q1: 5 }));
    const q2 = world.filter((r) => r.questionId === 'Q2');
    // testers who gave 5 on Q1 = t1,t2 → their Q2 answers
    expect(applyDrill(q2, ids).map((r) => r.testerId).sort()).toEqual(['t1', 't2']);
  });

  it('drops responses with no testerId while a constraint is active', () => {
    const ids = new Set(['t1']);
    const data = [resp('t1', 'Q2', 4), resp(null, 'Q2', 4)];
    expect(applyDrill(data, ids).map((r) => r.testerId)).toEqual(['t1']);
  });

  it('end-to-end: selecting 5 on Q1 filters Q2 to those testers', () => {
    const drill: DrillSelection = { Q1: 5 };
    const sets = buildPerQuestionSets(world, drill);
    const q2Visible = applyDrill(
      world.filter((r) => r.questionId === 'Q2'),
      matchingTesterIds(sets),
    );
    expect(q2Visible.map((r) => `${r.testerId}=${r.numericValue}`).sort()).toEqual([
      't1=4',
      't2=2',
    ]);
  });
});

// ─── toggle / remove ─────────────────────────────────────────────────────────

describe('toggleDrill', () => {
  it('adds a new selection', () => {
    expect(toggleDrill({}, 'Q1', 5)).toEqual({ Q1: 5 });
  });

  it('replaces the value when a different bar is clicked', () => {
    expect(toggleDrill({ Q1: 5 }, 'Q1', 3)).toEqual({ Q1: 3 });
  });

  it('removes the selection when the same bar is clicked again', () => {
    expect(toggleDrill({ Q1: 5 }, 'Q1', 5)).toEqual({});
  });

  it('does not mutate the input', () => {
    const before = { Q1: 5 };
    toggleDrill(before, 'Q2', 4);
    expect(before).toEqual({ Q1: 5 });
  });
});

describe('removeDrill', () => {
  it('removes one question and leaves the rest', () => {
    expect(removeDrill({ Q1: 5, Q2: 4 }, 'Q1')).toEqual({ Q2: 4 });
  });

  it('is a no-op for an absent question', () => {
    expect(removeDrill({ Q1: 5 }, 'Q9')).toEqual({ Q1: 5 });
  });
});
