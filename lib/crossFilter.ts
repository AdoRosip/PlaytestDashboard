import type { Response } from './types';
import { parseDurationMinutes, playtimeBucket, PLAYTIME_BUCKETS } from './duration';

// ─────────────────────────────────────────────────────────────────────────────
// In-category cross-question drill-down ("local filter").
//
// On a category page the user can click any answer bar — a rating bucket ("5")
// or a verbatim choice ("Yes") — to filter every *other* question down to the
// testers who gave that answer. Selecting several bars on one question ORs those
// values together. Selecting bars on several questions ANDs the per-question
// constraints together.
//
// This is a *tester* filter, exactly like the global one in `filtering.ts`:
// each `{ questionId → ratings[] }` entry resolves to the union of testers who
// gave any selected rating on that question, and the active set is the
// intersection of those per-question sets.
//
// Kept pure (no React / no store) so it is directly unit-testable; the page
// component only owns the `DrillSelection` state and renders the result.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single clicked answer. Numbers are rating buckets and match `numericValue`;
 * strings are verbatim answers (yes/no, multiple choice) and match `rawAnswer`.
 */
export type DrillValue = number | string;

/** Map of questionId → selected answers. Values OR; questions AND. */
export type DrillSelection = Record<string, DrillValue[]>;

/**
 * Normalize a verbatim answer for matching.
 *
 * The choice breakdown buckets by `rawAnswer.trim()`, so trimming here — and
 * nothing more — keeps a drill set identical to the bar the user clicked. Case
 * is deliberately significant: "Yes" and "yes" are drawn as two separate bars,
 * so folding them here would select more testers than the clicked bar counts.
 */
export const answerKey = (rawAnswer: string): string => rawAnswer.trim();

/**
 * Answer counts for a yes/no or multiple-choice chart, bucketed by `answerKey`
 * so a clicked bar resolves to exactly the testers it counted.
 *
 * Bar order is the form's own `options` order when known — choice scales such as
 * "Far too easy" … "Far too hard" are ordinal — followed by any other answer in
 * `all` (the question's answers before any cross-filter), most common first.
 * Every option gets a bar, so filtering changes bar heights but never reorders
 * them or drops one. Percentages are of the answered `visible` responses.
 */
export function computeChoiceDistribution(
  visible: Pick<Response, 'rawAnswer'>[],
  all: Pick<Response, 'rawAnswer'>[],
  options: string[] = [],
): { label: string; count: number; pct: number }[] {
  const tally = (list: Pick<Response, 'rawAnswer'>[]) => {
    const counts = new Map<string, number>();
    for (const r of list) {
      const key = answerKey(r.rawAnswer ?? '');
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  };
  const order = [...new Set(options.map(answerKey).filter(Boolean))];
  const seen = [...tally(all)].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([label]) => label);
  for (const label of seen) if (!order.includes(label)) order.push(label);
  const counts = tally(visible);
  // A visible answer missing from `all` would be a caller bug, but keep it rather than hide data.
  for (const label of counts.keys()) if (!order.includes(label)) order.push(label);
  const total = [...counts.values()].reduce((s, n) => s + n, 0);
  return order.map((label) => {
    const count = counts.get(label) ?? 0;
    return { label, count, pct: total > 0 ? Math.round((count / total) * 100) : 0 };
  });
}

/** The numeric members of a selection — rating bar charts only understand numbers. */
export function numericDrillValues(values: DrillValue[] | undefined): number[] {
  return (values ?? []).filter((v): v is number => typeof v === 'number');
}

/** Numbers first (ascending), then verbatim answers (alphabetical). */
function compareDrillValues(a: DrillValue, b: DrillValue): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'number') return -1;
  if (typeof b === 'number') return 1;
  return a.localeCompare(b);
}

/**
 * Build, for each drilled question, the set of tester ids who answered the
 * any selected rating on that question.
 *
 * Matching mirrors the bar chart's bucketing: the chart rounds `numericValue`
 * to the nearest integer bucket (see `computeRatingDistribution`), so we round
 * here too. This keeps the cross-filter set consistent with the bar counts the
 * user clicked — a value of 4.5 lives in the "5" bar and matches a "5" drill.
 */
export function buildPerQuestionSets(
  responses: Response[],
  drill: DrillSelection,
): Map<string, Set<string>> {
  const sets = new Map<string, Set<string>>();
  for (const [qid, values] of Object.entries(drill)) {
    if (values.length === 0) continue;
    const ratings = new Set(numericDrillValues(values));
    const answers = new Set(values.filter((v): v is string => typeof v === 'string'));
    // A Duration chart's bars are playtime bands ("1–3h"); they match answers by
    // their minutes, since no tester typed the band label itself.
    const bands = new Set(PLAYTIME_BUCKETS.filter((b) => answers.has(b.label)).map((b) => b.value));
    const s = new Set<string>();
    for (const r of responses) {
      if (r.questionId !== qid || r.testerId === null) continue;
      const ratingHit = r.numericValue !== null && ratings.has(Math.round(r.numericValue));
      const answerHit = answers.size > 0 && answers.has(answerKey(r.rawAnswer ?? ''));
      const minutes = bands.size > 0 ? parseDurationMinutes(r.rawAnswer ?? '') : null;
      const bandHit = minutes !== null && bands.has(playtimeBucket(minutes / 60));
      if (ratingHit || answerHit || bandHit) s.add(r.testerId);
    }
    sets.set(qid, s);
  }
  return sets;
}

/**
 * Intersect every per-question tester set, optionally excluding one question.
 *
 * Returns `null` when no constraint applies — either no question is drilled, or
 * the only drilled question is the excluded one. `null` means "don't filter".
 * `excludeQid` lets a question's own chart keep showing the full distribution
 * (filtered only by the *other* questions' selections).
 */
export function matchingTesterIds(
  perQuestionSets: Map<string, Set<string>>,
  excludeQid?: string,
): Set<string> | null {
  let acc: Set<string> | null = null;
  for (const [qid, s] of perQuestionSets) {
    if (qid === excludeQid) continue;
    acc =
      acc === null
        ? new Set(s)
        : new Set([...acc].filter((id: string) => s.has(id)));
  }
  return acc;
}

/**
 * Narrow a list of responses to those from testers in the active intersection.
 *
 * When `ids` is `null` (no active constraint) the list is returned unchanged.
 * Responses with no `testerId` are dropped while a constraint is active — they
 * can't be attributed to a tester, so they can't satisfy a tester filter.
 */
export function applyDrill(
  responses: Response[],
  ids: Set<string> | null,
): Response[] {
  if (ids === null) return responses;
  return responses.filter((r) => r.testerId !== null && ids.has(r.testerId));
}

/** Add a value to a question, or remove only that value when clicked again. */
export function toggleDrill(
  drill: DrillSelection,
  questionId: string,
  value: DrillValue,
): DrillSelection {
  const current = drill[questionId] ?? [];
  if (current.includes(value)) {
    const remaining = current.filter((selected) => selected !== value);
    if (remaining.length > 0) return { ...drill, [questionId]: remaining };
    const next = { ...drill };
    delete next[questionId];
    return next;
  }
  return { ...drill, [questionId]: [...current, value].sort(compareDrillValues) };
}

/** Remove a single question's selection. */
export function removeDrill(drill: DrillSelection, questionId: string): DrillSelection {
  const next = { ...drill };
  delete next[questionId];
  return next;
}
