import type { Response } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// In-category cross-question drill-down ("local filter").
//
// On a category page the user can click a rating bar (e.g. "5") on one question
// to filter every *other* question down to the testers who gave that rating.
// Selecting bars on several questions ANDs the constraints together.
//
// This is a *tester* filter, exactly like the global one in `filtering.ts`:
// each `{ questionId → rating }` entry resolves to the set of testers who gave
// that rating on that question, and the active set is the intersection of those
// sets. Everything else (which responses are visible per question) derives from
// the intersection.
//
// Kept pure (no React / no store) so it is directly unit-testable; the page
// component only owns the `DrillSelection` state and renders the result.
// ─────────────────────────────────────────────────────────────────────────────

/** Map of questionId → selected rating value. Entries AND together. */
export type DrillSelection = Record<string, number>;

/**
 * Build, for each drilled question, the set of tester ids who answered the
 * selected rating on that question.
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
  for (const [qid, val] of Object.entries(drill)) {
    const s = new Set<string>();
    for (const r of responses) {
      if (
        r.questionId === qid &&
        r.testerId !== null &&
        r.numericValue !== null &&
        Math.round(r.numericValue) === val
      ) {
        s.add(r.testerId);
      }
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

/** Add a selection, or remove it when the same value is clicked again (toggle). */
export function toggleDrill(
  drill: DrillSelection,
  questionId: string,
  value: number,
): DrillSelection {
  if (drill[questionId] === value) {
    const next = { ...drill };
    delete next[questionId];
    return next;
  }
  return { ...drill, [questionId]: value };
}

/** Remove a single question's selection. */
export function removeDrill(drill: DrillSelection, questionId: string): DrillSelection {
  const next = { ...drill };
  delete next[questionId];
  return next;
}
