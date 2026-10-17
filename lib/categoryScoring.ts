import type { Question, Response } from './types';
import { isRatingType } from './scoring';

// Temporary exclusions for the WNMN questionnaire. Category membership alone
// does not imply that a question measures game quality. Replace these explicit
// wording rules with backend scoring metadata once that contract is available.
const CONTEXT_QUESTIONS = [
  /^Do you enjoy playing similar games\?/i,
  /^We tried to build bridges to overcome most obstacles\.?$/i,
];

/** Keep the original answers available for charts; exclude context only from category scores. */
export function categoryScoringResponses(questions: Question[], responses: Response[]): Response[] {
  const ids = new Set(questions.filter(q =>
    isRatingType(q.type) && !CONTEXT_QUESTIONS.some(pattern => pattern.test(q.text.trim())),
  ).map(q => q.id));
  return responses.filter(r => ids.has(r.questionId) && r.normalizedScore !== null);
}
