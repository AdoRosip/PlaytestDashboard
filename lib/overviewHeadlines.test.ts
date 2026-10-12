import { describe, it, expect } from 'vitest';
import type { Question, QuestionType, Response } from './types';
import { computeOverviewHeadlines } from './overviewHeadlines';

function question(id: string, text: string, type: QuestionType): Question {
  const scaleMax = type === 'rating_1_10' ? 10 : type === 'rating_1_5' ? 5 : undefined;
  return { id, projectId: 'p', text, type, categoryId: null, sourceColumn: id, scaleMin: scaleMax && 1, scaleMax };
}
function answers(questionId: string, values: string[]): Response[] {
  return values.map((v, i) => ({
    id: `${questionId}_${i}`, projectId: 'p', testerId: `t${i}`, questionId, rawAnswer: v,
    numericValue: /^\d+$/.test(v) ? Number(v) : null, normalizedScore: null, submittedAt: '', matchStatus: 'matched',
  }));
}

const questions = [
  question('similar', 'Do you enjoy playing similar games?', 'rating_1_5'),
  question('again', 'How likely are you to play this game again in its current state?', 'rating_1_5'),
  question('recommend', 'How likely would you be to recommend this game to a friend?', 'rating_1_5'),
  question('bugs', 'Did you encounter any bugs, soft-locks, crashes or other performance or connection issues?', 'multiple_choice'),
  question('bugReport', 'Report every bug, soft-lock or crash you found.', 'free_text'),
  question('difficulty', 'Overall, how difficult was the game?', 'multiple_choice'),
  question('overall', 'How would you rate your overall experience with the game?', 'rating_1_10'),
];
const responses = [
  ...answers('again', ['5', '4', '1', '5', '4', '5', '2', '3', '2', '2']),
  ...answers('recommend', ['5', '4', '2', '5', '5', '5', '2', '4', '2', '3']),
  ...answers('bugs', ['No', 'No', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'No', 'Yes', 'Yes']),
  ...answers('overall', ['9', '7', '7', '10', '9', '9', '4', '6', '5', '4']),
];

describe('computeOverviewHeadlines', () => {
  it('finds the four headline questions by type and wording', () => {
    const h = computeOverviewHeadlines(questions, responses);
    expect(h.overall).toMatchObject({ questionId: 'overall', avg: 7, max: 10, highFrom: 8, highPct: 40, n: 10 });
    expect(h.recommend).toMatchObject({ questionId: 'recommend', pct: 60, count: 6, n: 10, from: 4, max: 5 });
    expect(h.playAgain).toMatchObject({ questionId: 'again', pct: 50, count: 5, n: 10 });
    expect(h.bugs).toMatchObject({ questionId: 'bugs', pct: 70, count: 7, n: 10 });
  });

  it('returns null for questions the test does not ask', () => {
    const h = computeOverviewHeadlines([questions[0]], answers('similar', ['4']));
    expect(h).toEqual({ overall: null, recommend: null, playAgain: null, bugs: null });
  });

  it('skips questions already shown as game KPIs', () => {
    const h = computeOverviewHeadlines(questions, responses, new Set(['recommend']));
    expect(h.recommend).toBeNull();
    expect(h.overall?.questionId).toBe('overall');
  });

  it('ignores a bug question whose answers are not plain Yes/No', () => {
    const q = [question('bugs', 'Which bugs did you hit?', 'multiple_choice')];
    expect(computeOverviewHeadlines(q, answers('bugs', ['Yes', 'Crash on load'])).bugs).toBeNull();
  });
});
