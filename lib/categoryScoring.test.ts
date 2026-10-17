import { describe, expect, it } from 'vitest';
import { categoryScoringResponses } from './categoryScoring';
import { computeOverviewHeadlines } from './overviewHeadlines';
import { computeNormalizedScore } from './scoring';
import type { Question, Response } from './types';

const question = (id: string, text: string, max = 5): Question => ({
  id, text, projectId: 'p', categoryId: 'cat', sourceColumn: id,
  type: max === 10 ? 'rating_1_10' : 'rating_1_5', scaleMin: 1, scaleMax: max,
});
const answer = (q: Question, value: number, id = q.id): Response => ({
  id, questionId: q.id, projectId: 'p', testerId: 't', rawAnswer: String(value),
  numericValue: value, normalizedScore: computeNormalizedScore(q, value),
  submittedAt: '', matchStatus: 'matched',
});

describe('category scoring exclusions', () => {
  it('excludes similar-game affinity without changing the overall headline or source answers', () => {
    const affinity = question('affinity', 'Do you enjoy playing similar games? Examples: R.E.P.O., RV There Yet?, PEAK, etc.');
    const overall = question('overall', 'How would you rate your overall experience with the game?', 10);
    const responses = [answer(affinity, 5), answer(overall, 7)];
    expect(categoryScoringResponses([affinity, overall], responses)).toEqual([responses[1]]);
    expect(computeOverviewHeadlines([affinity, overall], responses).overall?.avg).toBe(7);
    expect(responses[0].normalizedScore).toBe(100);
  });

  it('excludes bridge usage while retaining questions about enjoyment and physics', () => {
    const bridge = question('bridge', 'We tried to build bridges to overcome most obstacles.');
    const loop = question('loop', 'The main activity of the game was enjoyable to repeat.');
    const physics = question('physics', 'Did you find physics intuitive and fun?');
    const questions = [bridge, loop, physics];
    const responses = questions.map(q => answer(q, 4));
    expect(categoryScoringResponses(questions, responses).map(r => r.questionId)).toEqual(['loop', 'physics']);
  });

  it('preserves the supplied cohort and category boundaries', () => {
    const first = question('first', 'The controls did what I expected them to do.');
    const other = question('other', 'How would you rate the look and sound of the game?');
    const responses = [answer(first, 1, 'a'), answer(first, 5, 'b'), answer(other, 4)];
    expect(categoryScoringResponses([first], responses.slice(1))).toEqual([responses[1]]);
  });

  it('keeps choice-based difficulty and invalid answers out of category scores', () => {
    const difficulty: Question = { ...question('difficulty', 'Overall, how difficult was the game?'), type: 'multiple_choice' };
    const rating = question('rating', 'How would you rate the rotation mechanic?');
    const invalid = { ...answer(rating, 3), numericValue: null, normalizedScore: null };
    expect(categoryScoringResponses([difficulty, rating], [answer(difficulty, 3), invalid])).toEqual([]);
  });
});
