import { describe, expect, it } from 'vitest';
import { buildPerQuestionSets, matchingTesterIds } from './crossFilter';
import { mapPortalData } from './playlytix/mapper';
import { portalGenericConfig } from './games/portalGeneric';
import { buildRankingContext, computeRanking, isRankingStudy, ordinal, parseRankingAnswer, rankDrillValue } from './ranking';

// The orders of a real 10-tester trailer test (names only; no tester data).
const ITEMS = ['Long intro', 'No intro', 'Hype intro', 'Short intro'];
const ORDERS = [
  ['Long intro', 'Hype intro', 'Short intro', 'No intro'],
  ['Long intro', 'Hype intro', 'Short intro', 'No intro'],
  ['Hype intro', 'No intro', 'Short intro', 'Long intro'],
  ['Hype intro', 'Long intro', 'Short intro', 'No intro'],
  ['Long intro', 'Hype intro', 'Short intro', 'No intro'],
  ['No intro', 'Long intro', 'Short intro', 'Hype intro'],
  ['Short intro', 'Long intro', 'Hype intro', 'No intro'],
  ['Hype intro', 'Long intro', 'Short intro', 'No intro'],
  ['Long intro', 'Hype intro', 'No intro', 'Short intro'],
  ['Short intro', 'Long intro', 'No intro', 'Hype intro'],
];

function rankingTest(orders: unknown[] = ORDERS) {
  return {
    test: { TestID: 7, TestName: 'Trailer test', steamMatchGenres: ['Puzzle'] },
    questions: [
      { QuestionID: 1, QuestionText: 'Watch the trailers', DisplayOrder: 1, TypeName: 'SectionHeader', Category: { key: 'first-contact', code: 'A', label: 'First contact' } },
      { QuestionID: 2, QuestionText: '**Long intro:** https://example.test/a', DisplayOrder: 2, TypeName: 'InfoBlock', Items: null },
      { QuestionID: 3, QuestionText: 'Put the trailers in order from best to worst.', DisplayOrder: 3, TypeName: 'Ranking', Options: null,
        Items: ITEMS.map((name) => ({ name, url: '' })), Category: { key: 'core-loop', code: 'B', label: 'Core loop' } },
      { QuestionID: 4, QuestionText: 'Why did you choose this order?', DisplayOrder: 4, TypeName: 'LongText', Category: { key: 'core-loop', code: 'B', label: 'Core loop' } },
    ],
    responses: orders.map((order, i) => ({
      responseId: 100 + i, submittedAt: '2026-11-08T12:00:00.000Z', tester: { country: 'Slovakia' },
      answers: [{ questionId: 3, value: order }, { questionId: 4, value: `Reason ${i}` }], files: [], comments: [],
    })),
    stats: { totalResponses: orders.length, ratingAverages: {}, durationAverages: {}, rankingResults: {} },
  };
}
const map = (input: unknown) => mapPortalData(input, '18', '7', portalGenericConfig);

describe('ranking questions from the Portal', () => {
  it('maps Ranking as a ranked question and leaves InfoBlock out', () => {
    const data = map(rankingTest());
    expect(data.questions.map((q) => q.type)).toEqual(['ranking', 'free_text']);
    expect(data.questions[0].options).toEqual(ITEMS);
    expect(data.warnings.join(' ')).not.toMatch(/Unsupported|ranking/i);
    const first = data.responses.find((r) => r.questionId === data.questions[0].id)!;
    expect(first.ranking).toEqual(ORDERS[0]);
    expect(first.rawAnswer).toBe('1. Long intro · 2. Hype intro · 3. Short intro · 4. No intro');
    expect(isRankingStudy(data.questions)).toBe(true);
  });

  it('matches the Portal\'s own ranking stats', () => {
    const data = map(rankingTest());
    const result = computeRanking(data.questions[0], data.responses.filter((r) => r.questionId === data.questions[0].id));
    expect(result.n).toBe(10);
    expect(result.items.map((i) => [i.name, i.avgPlace, i.counts[0]])).toEqual([
      ['Long intro', 1.8, 4], ['Hype intro', 2.2, 3], ['Short intro', 2.7, 2], ['No intro', 3.3, 1],
    ]);
    expect(result.items[0].pcts).toEqual([40, 50, 0, 10]);
    expect(result.items[0].pcts.reduce((s, p) => s + p, 0)).toBe(100);
  });

  it('shows but does not count a ranking that is incomplete or repeats an item', () => {
    const data = map(rankingTest([...ORDERS.slice(0, 2), ['Long intro', 'Long intro', 'No intro', 'Hype intro'], ['Long intro']]));
    const ranked = data.responses.filter((r) => r.questionId === data.questions[0].id);
    expect(ranked).toHaveLength(4);
    expect(ranked.filter((r) => r.ranking)).toHaveLength(2);
    expect(ranked[2].rawAnswer).toBe('Long intro, Long intro, No intro, Hype intro');
    expect(data.warnings).toContain('A ranking did not list each item exactly once; it is shown but not counted (2×).');
    expect(computeRanking(data.questions[0], ranked).n).toBe(2);
  });

  it('cross-filters to the testers who put an item in a given place', () => {
    const data = map(rankingTest());
    const q = data.questions[0];
    const sets = buildPerQuestionSets(data.responses, { [q.id]: [rankDrillValue('Hype intro', 1)] });
    const ids = matchingTesterIds(sets)!;
    expect(ids.size).toBe(3);
    const why = data.responses.filter((r) => r.questionId === data.questions[1].id && ids.has(r.testerId!));
    expect(why.map((r) => r.rawAnswer)).toEqual(['Reason 2', 'Reason 3', 'Reason 7']);
  });

  it('gives the AI each tester\'s order', () => {
    const data = map(rankingTest());
    const context = buildRankingContext(data.questions, data.responses)!;
    expect(context.question).toBe('Put the trailers in order from best to worst.');
    expect(Object.values(context.byTester)).toEqual(ORDERS);
  });
});

describe('ranking helpers', () => {
  it('validates orders against the items', () => {
    expect(parseRankingAnswer([' B ', 'A'], ['A', 'B'])).toEqual(['B', 'A']);
    expect(parseRankingAnswer(['A', 'C'], ['A', 'B'])).toBeNull();
    expect(parseRankingAnswer('A, B', ['A', 'B'])).toBeNull();
    expect(parseRankingAnswer(['A', 'B'], undefined)).toEqual(['A', 'B']);
  });
  it('is not a ranking study when the test also has ratings', () => {
    expect(isRankingStudy([{ type: 'ranking' }, { type: 'rating_1_5' }])).toBe(false);
    expect(isRankingStudy([{ type: 'free_text' }])).toBe(false);
  });
  it('writes ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd']);
  });
});
