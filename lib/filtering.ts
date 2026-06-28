import type { FilterState, Question, Response, SentimentBand, Tester } from './types';
import { isSentimentOutlier } from './outliers';
import { continentFor } from './geo';

// ─── Player-sentiment bands ──────────────────────────────────────────────────
// Classify a tester by their answer to the single "overall enjoyment" question
// (How much did you enjoy the game overall?), expressed on a 0–5 scale — *not*
// their average across all rating questions. "Almost Believers" are the
// fence-sitters who scored 3–4 — interested but not sold. Boundaries are
// inclusive on the almost-believers band so every classifiable tester lands in
// exactly one band:
//   score < 3 → detractors · 3 ≤ score ≤ 4 → almost believers · score > 4 → believers
// Testers who didn't answer the enjoyment question stay unclassified.
export const SENTIMENT_BAND_LABELS: Record<SentimentBand, string> = {
  detractors: 'Detractors',
  almost_believers: 'Almost Believers',
  believers: 'Believers',
};

export function sentimentBand(enjoyRating: number | undefined): SentimentBand | null {
  if (enjoyRating === undefined) return null;
  if (enjoyRating < 3) return 'detractors';
  if (enjoyRating > 4) return 'believers';
  return 'almost_believers';
}

/** Matches the "How much did you enjoy the game overall?" question. */
export const ENJOY_OVERALL_RE = /enjoy.*overall|overall.*enjoy/i;

/**
 * Map of testerId → overall-enjoyment rating on a 0–5 scale, derived from the
 * enjoyment question's normalized (0–100) score so it matches how `avgRating`
 * is scaled (avgNorm / 20). Testers without an answer are absent from the map.
 */
export function buildEnjoyRatingMap(
  responses: Response[],
  questions: Question[],
): Map<string, number> {
  const map = new Map<string, number>();
  const q = questions.find((q) => ENJOY_OVERALL_RE.test(q.text));
  if (!q) return map;
  for (const r of responses) {
    if (r.questionId === q.id && r.testerId && r.normalizedScore !== null) {
      map.set(r.testerId, r.normalizedScore / 20);
    }
  }
  return map;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure filter logic.
//
// The filter is fundamentally a *tester* filter: every filter dimension narrows
// the set of testers, and everything else (responses, scores, counts) is derived
// from that set. Keeping this logic pure (no store / no caching) makes it
// directly unit-testable — the store layer in `store.ts` only adds memoisation
// on top of these functions.
// ─────────────────────────────────────────────────────────────────────────────

export interface FilterInput {
  testers: Tester[];
  responses: Response[];
  questions: Question[];
  filters: FilterState;
}

/** Regex that identifies the "how long did you play this session" question. */
const SESSION_PLAYTIME_RE =
  /how many hours.*(?:play|game|session)|hours.*played.*(?:exo|game|session)/i;

export function hasActiveFilters(f: FilterState): boolean {
  return (
    f.ageGroups.length > 0 ||
    f.genders.length > 0 ||
    f.continents.length > 0 ||
    f.countries.length > 0 ||
    f.hardwareTiers.length > 0 ||
    f.sessionPlaytime !== null ||
    f.playerSentiment !== null ||
    f.playedFactorio ||
    f.playedSatisfactory ||
    f.excludeStraightLiners ||
    f.excludeSentimentOutliers
  );
}

/** Map of testerId → reported session playtime (numeric answers only). */
function buildPlaytimeMap(responses: Response[], questions: Question[]): Map<string, number> {
  const map = new Map<string, number>();
  const q = questions.find((q) => SESSION_PLAYTIME_RE.test(q.text));
  if (!q) return map;
  for (const r of responses) {
    if (r.questionId === q.id && r.testerId && r.numericValue !== null) {
      map.set(r.testerId, r.numericValue);
    }
  }
  return map;
}

/**
 * Set of tester ids who reported having played a background game (e.g. Factorio).
 * `pattern` matches the question text; the question must live in the
 * "Tester Background" category (`cat_01`).
 */
function buildPlayedGameSet(
  pattern: RegExp,
  responses: Response[],
  questions: Question[],
): Set<string> {
  const set = new Set<string>();
  const q = questions.find((q) => pattern.test(q.text) && q.categoryId === 'cat_01');
  if (!q) return set;
  for (const r of responses) {
    if (r.questionId !== q.id || !r.testerId) continue;
    const n = r.numericValue ?? 0;
    const raw = r.rawAnswer.toLowerCase().trim();
    const negatives = new Set(['0', 'no', 'none', 'never', 'n/a', 'na']);
    if (n > 0 || (raw && !negatives.has(raw))) {
      set.add(r.testerId);
    }
  }
  return set;
}

function matchesPlaytimeBucket(bucket: FilterState['sessionPlaytime'], pt: number): boolean {
  return (
    (bucket === '<1h' && pt < 1) ||
    (bucket === '1-3h' && pt >= 1 && pt <= 3) ||
    (bucket === '3-6h' && pt > 3 && pt <= 6) ||
    (bucket === '6h+' && pt > 6)
  );
}

/**
 * Returns the set of tester ids that satisfy every active filter dimension,
 * or `null` when no filter is active (meaning "all testers — don't filter").
 *
 * Within a dimension the match is OR (any selected value); across dimensions
 * it is AND (must satisfy all dimensions).
 */
export function computeFilteredTesterIds(input: FilterInput): Set<string> | null {
  const { testers, responses, questions, filters } = input;

  if (!hasActiveFilters(filters)) return null;

  const playtimeMap =
    filters.sessionPlaytime !== null ? buildPlaytimeMap(responses, questions) : null;
  const enjoyMap =
    filters.playerSentiment !== null ? buildEnjoyRatingMap(responses, questions) : null;
  const factorioTesters = filters.playedFactorio
    ? buildPlayedGameSet(/factorio/i, responses, questions)
    : null;
  const satTesters = filters.playedSatisfactory
    ? buildPlayedGameSet(/satisfactory/i, responses, questions)
    : null;

  const result = new Set<string>();
  for (const t of testers) {
    if (filters.ageGroups.length > 0 && !filters.ageGroups.includes(t.ageGroup)) continue;
    if (filters.genders.length > 0 && !filters.genders.includes(t.segments.gender ?? '')) continue;
    if (filters.continents.length > 0) {
      const c = t.country || t.segments.country || '';
      if (!filters.continents.includes(continentFor(c))) continue;
    }
    if (filters.countries.length > 0) {
      const c = t.country || t.segments.country || '';
      if (!filters.countries.includes(c)) continue;
    }
    if (
      filters.hardwareTiers.length > 0 &&
      !filters.hardwareTiers.includes(t.segments.hardware_tier ?? 'Unknown')
    ) {
      continue;
    }
    if (filters.sessionPlaytime !== null) {
      const pt = playtimeMap!.get(t.id);
      if (pt === undefined) continue;
      if (!matchesPlaytimeBucket(filters.sessionPlaytime, pt)) continue;
    }
    if (filters.playerSentiment !== null && sentimentBand(enjoyMap!.get(t.id)) !== filters.playerSentiment) {
      continue;
    }
    if (factorioTesters && !factorioTesters.has(t.id)) continue;
    if (satTesters && !satTesters.has(t.id)) continue;
    if (filters.excludeStraightLiners && t.quality?.straightLining) continue;
    if (filters.excludeSentimentOutliers && isSentimentOutlier(t.quality)) continue;
    result.add(t.id);
  }
  return result;
}

/** Narrow responses to the given tester id set (`null` = no filter → all). */
export function filterResponsesByTesterIds(
  responses: Response[],
  ids: Set<string> | null,
): Response[] {
  if (ids === null) return responses;
  return responses.filter((r) => r.testerId === null || ids.has(r.testerId));
}

/** Narrow testers to the given id set (`null` = no filter → all). */
export function filterTestersByIds(testers: Tester[], ids: Set<string> | null): Tester[] {
  if (ids === null) return testers;
  return testers.filter((t) => ids.has(t.id));
}

export function countActiveFilters(f: FilterState): number {
  return (
    f.ageGroups.length +
    f.genders.length +
    f.continents.length +
    f.countries.length +
    f.hardwareTiers.length +
    (f.sessionPlaytime !== null ? 1 : 0) +
    (f.playerSentiment !== null ? 1 : 0) +
    (f.playedFactorio ? 1 : 0) +
    (f.playedSatisfactory ? 1 : 0) +
    (f.excludeStraightLiners ? 1 : 0) +
    (f.excludeSentimentOutliers ? 1 : 0)
  );
}
