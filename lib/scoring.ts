import type { Question, QuestionType } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for turning a raw numeric answer into a normalized
// 0–100 score. `normalizedScore` is always "higher = better": negative-valence
// questions (isInverseScored) are flipped here, once, so every downstream metric
// — overview, categories, questions, outliers — gets the right direction for
// free.
// ─────────────────────────────────────────────────────────────────────────────

export function isRatingType(type: QuestionType): boolean {
  return type === 'rating_1_5' || type === 'rating_1_10';
}

/** The implied scale for a rating type; empty (cleared) for everything else. */
export function scaleForType(type: QuestionType): { scaleMin?: number; scaleMax?: number } {
  if (type === 'rating_1_5') return { scaleMin: 1, scaleMax: 5 };
  if (type === 'rating_1_10') return { scaleMin: 1, scaleMax: 10 };
  return { scaleMin: undefined, scaleMax: undefined };
}

export function computeNormalizedScore(
  q: Pick<Question, 'scaleMin' | 'scaleMax' | 'isInverseScored'>,
  numericValue: number | null,
): number | null {
  if (
    numericValue === null ||
    q.scaleMin === undefined ||
    q.scaleMax === undefined ||
    q.scaleMax === q.scaleMin
  ) {
    return null;
  }
  const pct = ((numericValue - q.scaleMin) / (q.scaleMax - q.scaleMin)) * 100;
  const clamped = Math.max(0, Math.min(100, pct)); // guard out-of-range answers
  return Math.round(q.isInverseScored ? 100 - clamped : clamped);
}
