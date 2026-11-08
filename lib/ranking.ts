import type { Question, Response } from './types';
import { isRatingType } from './scoring';

// ─────────────────────────────────────────────────────────────────────────────
// Ranking questions ("put these trailers in order, best first").
//
// A ranking answer is stored on `Response.ranking` as the question's options,
// best first. Results are computed here from whatever responses the caller
// hands in, so segment filters and the cross-filter apply. The Portal's own
// `stats.rankingResults` always covers every tester and is ignored for that reason.
// ─────────────────────────────────────────────────────────────────────────────

export interface RankingItemResult {
  name: string;
  /** counts[i] = testers who put this item in place i + 1. */
  counts: number[];
  /** pcts[i] = counts[i] as a whole percentage of the rankings counted. */
  pcts: number[];
  /** Mean place, 1 = best. Null when no ranking was counted. */
  avgPlace: number | null;
}

export interface RankingResult {
  /** Number of places (= number of items). */
  places: number;
  /** Rankings counted. */
  n: number;
  /** Best average place first. */
  items: RankingItemResult[];
}

/**
 * Validate a raw Portal ranking answer against the question's items.
 * Returns the trimmed order when it lists every item exactly once, otherwise null.
 */
export function parseRankingAnswer(value: unknown, items: string[] | undefined): string[] | null {
  if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) return null;
  const order = (value as string[]).map((v) => v.trim());
  if (order.some((v) => !v) || new Set(order).size !== order.length) return null;
  if (items?.length) {
    if (order.length !== items.length || !order.every((v) => items.includes(v))) return null;
  } else if (order.length < 2) return null;
  return order;
}

/** "1. Long intro · 2. Hype intro · …", the readable form kept in `rawAnswer`. */
export function formatRanking(order: string[]): string {
  return order.map((name, i) => `${i + 1}. ${name}`).join(' · ');
}

export function ordinal(place: number): string {
  const tens = place % 100;
  if (tens >= 11 && tens <= 13) return `${place}th`;
  return `${place}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[place % 10] ?? 'th'}`;
}

export function computeRanking(
  question: Pick<Question, 'options'>,
  responses: Pick<Response, 'ranking'>[],
): RankingResult {
  const rankings = responses.flatMap((r) => (r.ranking?.length ? [r.ranking] : []));
  const names = [...(question.options ?? [])];
  for (const order of rankings) for (const name of order) if (!names.includes(name)) names.push(name);
  const places = names.length;
  const n = rankings.length;
  const items = names.map((name, formIndex) => {
    const counts = Array.from({ length: places }, () => 0);
    for (const order of rankings) {
      const index = order.indexOf(name);
      if (index >= 0) counts[index] += 1;
    }
    const total = counts.reduce((s, c) => s + c, 0);
    const avgPlace = total ? counts.reduce((s, c, i) => s + c * (i + 1), 0) / total : null;
    return {
      formIndex,
      result: { name, counts, pcts: counts.map((c) => (n ? Math.round((c / n) * 100) : 0)), avgPlace },
    };
  });
  items.sort((a, b) =>
    (a.result.avgPlace ?? Infinity) - (b.result.avgPlace ?? Infinity)
    || b.result.counts[0] - a.result.counts[0]
    || a.formIndex - b.formIndex);
  return { places, n, items: items.map((i) => i.result) };
}

// ── Cross-filter ─────────────────────────────────────────────────────────────
// A clicked matrix cell is a drill value "Long intro #1": testers who put
// "Long intro" in 1st place. It is a plain string so it fits `DrillValue` and
// reads naturally in the cross-filter chip.

export const rankDrillValue = (item: string, place: number): string => `${item} #${place}`;

export function parseRankDrillValue(value: string): { item: string; place: number } | null {
  const match = /^([\s\S]+) #(\d+)$/.exec(value);
  return match ? { item: match[1], place: Number(match[2]) } : null;
}

export function rankingMatches(ranking: string[] | undefined, value: string): boolean {
  const parsed = parseRankDrillValue(value);
  return !!ranking && !!parsed && ranking[parsed.place - 1] === parsed.item;
}

// ── Questionnaire shape ──────────────────────────────────────────────────────

/**
 * A ranking study is a test built around ranking questions, with no rating
 * questions for the scoring overview to work with.
 *
 * Inferred from the questions because the Portal does not yet say what kind of
 * questionnaire a test is. Once it does, read that here instead.
 */
export function isRankingStudy(questions: Pick<Question, 'type'>[]): boolean {
  return questions.some((q) => q.type === 'ranking') && !questions.some((q) => isRatingType(q.type));
}

/** Context for the AI: each tester's order on the test's (first) ranking question. */
export interface RankingContext {
  question: string;
  byTester: Record<string, string[]>;
}

export function buildRankingContext(
  questions: Pick<Question, 'id' | 'type' | 'text'>[],
  responses: Pick<Response, 'questionId' | 'testerId' | 'ranking'>[],
): RankingContext | undefined {
  const rankingQ = questions.find((q) => q.type === 'ranking');
  if (!rankingQ) return undefined;
  const byTester: Record<string, string[]> = {};
  for (const r of responses) {
    if (r.questionId === rankingQ.id && r.testerId && r.ranking?.length) byTester[r.testerId] = r.ranking;
  }
  return Object.keys(byTester).length ? { question: rankingQ.text, byTester } : undefined;
}
