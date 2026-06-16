import { describe, it, expect } from 'vitest';
import type { Question, Response, Tester } from './types';
import { computeTesterQuality } from './outliers';

// ─── Fixture builders ────────────────────────────────────────────────────────

function tester(id: string): Tester {
  return {
    id, testerId: id, email: '', discord: '', segments: {},
    ageGroup: '', country: '', gamingProfile: '', hardware: '',
    similarGamesPlayed: [], rawProfileJson: {},
  };
}

function question(id: string, overrides: Partial<Question> = {}): Question {
  return {
    id, projectId: 'p', text: id, type: 'rating_1_5',
    categoryId: 'cat_02', sourceColumn: id, scaleMin: 1, scaleMax: 5, ...overrides,
  };
}

function resp(testerId: string, questionId: string, normalizedScore: number, numericValue = 3): Response {
  return {
    id: `${testerId}_${questionId}`, projectId: 'p', testerId, questionId,
    rawAnswer: String(numericValue), numericValue, normalizedScore,
    submittedAt: '', matchStatus: 'matched',
  };
}

/** Every tester answers the same N benchmark questions at their own fixed level. */
function flatScenario(levels: Record<string, number>, nQuestions = 6) {
  const questions = Array.from({ length: nQuestions }, (_, i) => question(`q${i}`));
  const testers = Object.keys(levels).map(tester);
  const responses: Response[] = [];
  for (const [id, level] of Object.entries(levels)) {
    for (const q of questions) responses.push(resp(id, q.id, level));
  }
  return { testers, questions, responses };
}

// 10 typical testers spread across a realistic range, one far below, one far above.
const TWO_SIDED_LEVELS: Record<string, number> = {
  T0: 50, T1: 55, T2: 60, T3: 65, T4: 70, T5: 75, T6: 80, T7: 60, T8: 65, T9: 70,
  Tharsh: 5, Tgen: 100,
};

// ─── Sentiment flags (robust, two-sided) ─────────────────────────────────────

describe('computeTesterQuality — sentiment flags', () => {
  it('flags the far-below tester as a harsh critic and the far-above as overly positive', () => {
    const { testers, questions, responses } = flatScenario(TWO_SIDED_LEVELS);
    const q = computeTesterQuality({ testers, questions, responses });

    expect(q.get('Tharsh')!.sentiment).toBe('harsh');
    expect(q.get('Tharsh')!.flags.some((f) => f.type === 'harsh_critic')).toBe(true);

    expect(q.get('Tgen')!.sentiment).toBe('generous');
    expect(q.get('Tgen')!.flags.some((f) => f.type === 'overly_positive')).toBe(true);
  });

  it('leaves middle-of-the-pack testers unflagged', () => {
    const { testers, questions, responses } = flatScenario(TWO_SIDED_LEVELS);
    const q = computeTesterQuality({ testers, questions, responses });
    expect(q.get('T0')!.sentiment).toBe('typical');
    expect(q.get('T0')!.flags).toHaveLength(0);
  });

  it('flags nobody when the group is smaller than the minimum', () => {
    // Only 8 testers including the harsh one → below minGroupForFlags (10).
    const subset = Object.fromEntries(
      Object.entries(TWO_SIDED_LEVELS).slice(0, 7).concat([['Tharsh', 5]]),
    );
    const { testers, questions, responses } = flatScenario(subset);
    const q = computeTesterQuality({ testers, questions, responses });
    expect(q.get('Tharsh')!.sentiment).toBe('typical');
    expect(q.get('Tharsh')!.robustZ).toBeUndefined();
  });

  it('does not score severity for testers below the minimum sample', () => {
    const { testers, questions, responses } = flatScenario(TWO_SIDED_LEVELS);
    // Tfew answers only 4 benchmark questions (< minForSeverity = 5).
    const few = tester('Tfew');
    const fewResponses = questions.slice(0, 4).map((qq) => resp('Tfew', qq.id, 10));
    const q = computeTesterQuality({
      testers: [...testers, few], questions, responses: [...responses, ...fewResponses],
    });
    expect(q.get('Tfew')!.severity).toBeUndefined();
    expect(q.get('Tfew')!.sentiment).toBe('typical');
    expect(q.get('Tfew')!.avgRating).toBeDefined(); // still shows a rating (>= minForRating)
  });
});

// ─── Question-mix bias removal ───────────────────────────────────────────────

describe('computeTesterQuality — per-question deviation', () => {
  it('does not penalise a tester who only answered hard (low-scoring) questions', () => {
    const hard = Array.from({ length: 5 }, (_, i) => question(`h${i}`));
    const easy = Array.from({ length: 5 }, (_, i) => question(`e${i}`));
    const questions = [...hard, ...easy];

    const testers = [tester('bg1'), tester('bg2'), tester('bg3'), tester('bg4'),
      tester('hardOnly'), tester('easyOnly')];
    const responses: Response[] = [];
    // Background testers establish each question's baseline (hard ≈ 20, easy ≈ 80).
    for (const id of ['bg1', 'bg2', 'bg3', 'bg4']) {
      for (const q of hard) responses.push(resp(id, q.id, 20));
      for (const q of easy) responses.push(resp(id, q.id, 80));
    }
    for (const q of hard) responses.push(resp('hardOnly', q.id, 20)); // on the hard mean
    for (const q of easy) responses.push(resp('easyOnly', q.id, 80)); // on the easy mean

    const q = computeTesterQuality({ testers, questions, responses });

    // Raw averages differ wildly…
    expect(q.get('hardOnly')!.avgNorm).toBe(20);
    expect(q.get('easyOnly')!.avgNorm).toBe(80);
    // …but both sit on their questions' means, so deviation (severity) ≈ 0.
    expect(Math.abs(q.get('hardOnly')!.severity ?? 99)).toBeLessThan(0.001);
    expect(Math.abs(q.get('easyOnly')!.severity ?? 99)).toBeLessThan(0.001);
  });
});

// ─── Straight-lining (quality) ───────────────────────────────────────────────

describe('computeTesterQuality — straight-lining', () => {
  it('flags a tester who gives the same rating to everything', () => {
    const questions = Array.from({ length: 10 }, (_, i) => question(`q${i}`));
    const testers = [tester('flat'), tester('varied')];
    const responses: Response[] = [];
    for (const q of questions) {
      responses.push(resp('flat', q.id, 100, 5)); // always 5
      responses.push(resp('varied', q.id, (Number(q.id.slice(1)) % 5) * 25, (Number(q.id.slice(1)) % 5) + 1));
    }
    const q = computeTesterQuality({ testers, questions, responses });
    expect(q.get('flat')!.straightLining).toBe(true);
    expect(q.get('flat')!.flags.some((f) => f.type === 'straight_liner')).toBe(true);
    expect(q.get('varied')!.straightLining).toBe(false);
  });
});
