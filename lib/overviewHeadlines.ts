import type { Question, Response } from './types';

export interface RatingHeadline { questionId: string; avg: number; max: number; highPct: number; highFrom: number; n: number }
export interface ShareHeadline { questionId: string; pct: number; count: number; n: number; from?: number; max?: number }
export interface OverviewHeadlines {
  overall: RatingHeadline | null;
  recommend: ShareHeadline | null;
  playAgain: ShareHeadline | null;
  bugs: ShareHeadline | null;
}

const isRating = (q: Question) => (q.type === 'rating_1_5' || q.type === 'rating_1_10') && !!q.scaleMax;

/**
 * Finds generic first-glance questions (overall rating, recommend, play again,
 * bug encountered) by question type plus wording. Questions in `excludeIds`
 * (already shown as game-config KPIs) are skipped so a tile never repeats.
 */
export function computeOverviewHeadlines(
  questions: Question[], responses: Response[], excludeIds: Set<string> = new Set(),
): OverviewHeadlines {
  const used = new Set(excludeIds);
  const pick = (candidates: Question[]) => {
    const q = candidates.find(c => !used.has(c.id));
    if (q) used.add(q.id);
    return q ?? null;
  };
  const answers = (q: Question) => responses.filter(r => r.questionId === q.id);
  const ratings = questions.filter(isRating);

  // Prefer a 1–10 overall rating over a 1–5 one.
  const overallQ = pick(ratings.filter(q => /\boverall\b/i.test(q.text))
    .sort((a, b) => (b.scaleMax ?? 0) - (a.scaleMax ?? 0)));
  const recommendQ = pick(ratings.filter(q => /\brecommend/i.test(q.text)));
  const playAgainQ = pick(ratings.filter(q => /\bplay\b.*\bagain\b|\breplay\b|\bcome back\b/i.test(q.text)));
  const bugsQ = pick(questions.filter(q =>
    (q.type === 'multiple_choice' || q.type === 'yes_no') && /\bbugs?\b|\bcrash|soft-?locks?\b|\bglitch/i.test(q.text)));

  const rating = (q: Question | null): RatingHeadline | null => {
    if (!q) return null;
    const vals = answers(q).flatMap(r => r.numericValue !== null ? [r.numericValue] : []);
    if (!vals.length) return null;
    const max = q.scaleMax!;
    const highFrom = Math.ceil(max * 0.8);
    return { questionId: q.id, avg: vals.reduce((a, b) => a + b, 0) / vals.length, max, highFrom,
      highPct: Math.round(vals.filter(v => v >= highFrom).length / vals.length * 100), n: vals.length };
  };
  // Top-two-box share: 4–5 on a 1–5 scale, 9–10 on a 1–10 scale.
  const topBox = (q: Question | null): ShareHeadline | null => {
    if (!q) return null;
    const vals = answers(q).flatMap(r => r.numericValue !== null ? [r.numericValue] : []);
    if (!vals.length) return null;
    const max = q.scaleMax!;
    const count = vals.filter(v => v >= max - 1).length;
    return { questionId: q.id, pct: Math.round(count / vals.length * 100), count, n: vals.length, from: max - 1, max };
  };
  const yesShare = (q: Question | null): ShareHeadline | null => {
    if (!q) return null;
    const vals = answers(q).map(r => r.rawAnswer.trim().toLowerCase()).filter(Boolean);
    // Only a plain Yes/No question can be read as "hit a bug".
    if (!vals.length || vals.some(v => v !== 'yes' && v !== 'no')) return null;
    const count = vals.filter(v => v === 'yes').length;
    return { questionId: q.id, pct: Math.round(count / vals.length * 100), count, n: vals.length };
  };

  return { overall: rating(overallQ), recommend: topBox(recommendQ), playAgain: topBox(playAgainQ), bugs: yesShare(bugsQ) };
}
