import type { Tester, Question, Response, TesterQuality, TesterFlag } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Tester quality / outlier detection.
//
// Two independent signals, deliberately kept separate:
//
//  1. SENTIMENT outlier (harsh critic / overly positive) — a tester whose rating
//     pattern is far from the group AFTER removing question-mix bias. Computed as
//     a per-question deviation (rater severity) and standardized with a robust
//     median + MAD estimator so the outliers don't distort their own threshold.
//     These are usually legitimate feedback — highlight, don't delete.
//
//  2. QUALITY outlier (straight-liner) — a tester who gave essentially the same
//     rating to everything. Low-information noise; the only flag that justifies
//     excluding a tester from aggregates.
//
// Detection is population-level: computed once over the whole uploaded set, not
// re-derived per active filter (that would make "outlier" depend on the very
// filter that removes them).
// ─────────────────────────────────────────────────────────────────────────────

export const OUTLIER_CONFIG = {
  // Categories that are demographic/technical/admin rather than experience ratings.
  excludedCategoryIds: new Set(['cat_01', 'cat_09', 'cat_15']),
  minForRating: 3,        // benchmark responses needed to show an avg rating
  minForSeverity: 5,      // benchmark responses needed to be eligible for sentiment flags
  minGroupForFlags: 10,   // testers-with-severity needed before flagging anyone
  shrinkageK: 5,          // pulls thin-sample severities toward 0 (n/(n+K))
  harshZ: 2.5,            // robust-z below which a tester is a harsh critic
  positiveZ: 2.5,         // robust-z above which a tester is overly positive
  minRatingsForStraightLining: 8,
  straightLiningDominance: 0.95, // share of identical ratings to flag as straight-lining
} as const;

type OutlierConfig = typeof OUTLIER_CONFIG;

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// `normalizedScore` is already direction-corrected upstream (lib/scoring.ts),
// so this module can treat it as plain "higher = better".

export interface TesterQualityInput {
  testers: Tester[];
  questions: Question[];
  responses: Response[];
  config?: OutlierConfig;
}

export function computeTesterQuality(input: TesterQualityInput): Map<string, TesterQuality> {
  const cfg = input.config ?? OUTLIER_CONFIG;
  const { testers, questions, responses } = input;

  const isBenchmark = (q: Question) =>
    !!q.categoryId &&
    !cfg.excludedCategoryIds.has(q.categoryId) &&
    (q.type === 'rating_1_5' || q.type === 'rating_1_10');

  const benchmarkQIds = new Set(questions.filter(isBenchmark).map((q) => q.id));
  const ratingQIds = new Set(
    questions.filter((q) => q.type === 'rating_1_5' || q.type === 'rating_1_10').map((q) => q.id),
  );

  // ── Per-question baseline: mean effective score across all testers ──────────
  const qSum = new Map<string, number>();
  const qCount = new Map<string, number>();
  for (const r of responses) {
    if (r.normalizedScore === null || !benchmarkQIds.has(r.questionId)) continue;
    qSum.set(r.questionId, (qSum.get(r.questionId) ?? 0) + r.normalizedScore);
    qCount.set(r.questionId, (qCount.get(r.questionId) ?? 0) + 1);
  }
  const qMean = new Map<string, number>();
  for (const [id, sum] of qSum) qMean.set(id, sum / (qCount.get(id) ?? 1));

  // ── Per-tester accumulation ────────────────────────────────────────────────
  interface Acc { benchScores: number[]; deviations: number[]; ratingValues: number[] }
  const acc = new Map<string, Acc>();
  const getAcc = (id: string): Acc => {
    let a = acc.get(id);
    if (!a) { a = { benchScores: [], deviations: [], ratingValues: [] }; acc.set(id, a); }
    return a;
  };

  for (const r of responses) {
    if (!r.testerId) continue;
    if (benchmarkQIds.has(r.questionId) && r.normalizedScore !== null) {
      const a = getAcc(r.testerId);
      a.benchScores.push(r.normalizedScore);
      a.deviations.push(r.normalizedScore - (qMean.get(r.questionId) ?? r.normalizedScore));
    }
    if (ratingQIds.has(r.questionId) && r.numericValue !== null) {
      getAcc(r.testerId).ratingValues.push(r.numericValue);
    }
  }

  // ── First pass: avgNorm, avgRating, shrunk severity, straight-lining ────────
  const result = new Map<string, TesterQuality>();
  const severityByTester = new Map<string, number>();
  let avgNormSum = 0;
  let avgNormN = 0;

  for (const tester of testers) {
    const a = acc.get(tester.id) ?? { benchScores: [], deviations: [], ratingValues: [] };
    const benchmarkN = a.benchScores.length;
    const q: TesterQuality = { benchmarkN, sentiment: 'typical', straightLining: false, flags: [] };

    if (benchmarkN >= cfg.minForRating) {
      const avgNorm = a.benchScores.reduce((s, x) => s + x, 0) / benchmarkN;
      q.avgNorm = avgNorm;
      q.avgRating = Math.round((avgNorm / 20) * 10) / 10;
      avgNormSum += avgNorm;
      avgNormN++;
    }

    if (benchmarkN >= cfg.minForSeverity) {
      const rawSev = a.deviations.reduce((s, x) => s + x, 0) / benchmarkN;
      const shrunk = rawSev * (benchmarkN / (benchmarkN + cfg.shrinkageK));
      q.severity = shrunk;
      severityByTester.set(tester.id, shrunk);
    }

    // Straight-lining: dominated by a single rating value across many questions.
    const rv = a.ratingValues;
    if (rv.length >= cfg.minRatingsForStraightLining) {
      const counts = new Map<number, number>();
      for (const v of rv) counts.set(v, (counts.get(v) ?? 0) + 1);
      let topVal = rv[0];
      let topCount = 0;
      for (const [v, c] of counts) if (c > topCount) { topCount = c; topVal = v; }
      if (topCount / rv.length >= cfg.straightLiningDominance) {
        q.straightLining = true;
        q.flags.push({
          type: 'straight_liner',
          detail: `Gave the same rating (${topVal}) on ${topCount} of ${rv.length} questions`,
        });
      }
    }

    result.set(tester.id, q);
  }

  // ── Second pass: robust sentiment flags ────────────────────────────────────
  const severities = [...severityByTester.values()];
  if (severities.length >= cfg.minGroupForFlags) {
    const med = median(severities);
    const mad = median(severities.map((s) => Math.abs(s - med)));
    const groupAvgNorm = avgNormN ? Math.round(avgNormSum / avgNormN) : 0;

    if (mad > 0) {
      for (const tester of testers) {
        const q = result.get(tester.id);
        const sev = severityByTester.get(tester.id);
        if (!q || sev === undefined) continue;
        const z = (sev - med) / (1.4826 * mad);
        q.robustZ = z;
        const avgDisplay = q.avgNorm !== undefined ? Math.round(q.avgNorm) : '—';
        if (z < -cfg.harshZ) {
          q.sentiment = 'harsh';
          q.flags.push({
            type: 'harsh_critic',
            detail: `Scored ${avgDisplay} vs ${groupAvgNorm} group · ${Math.abs(z).toFixed(1)}σ below`,
          });
        } else if (z > cfg.positiveZ) {
          q.sentiment = 'generous';
          q.flags.push({
            type: 'overly_positive',
            detail: `Scored ${avgDisplay} vs ${groupAvgNorm} group · ${z.toFixed(1)}σ above`,
          });
        }
      }
    }
  }

  return result;
}

// ── Convenience predicates ───────────────────────────────────────────────────

/** Quality noise that justifies removing a tester from aggregates. */
export function isQualityFlagged(q?: TesterQuality): boolean {
  return !!q?.straightLining;
}

export function isHarshCritic(q?: TesterQuality): boolean {
  return q?.sentiment === 'harsh';
}

/** "Concerning" flag used for the legacy isOutlier convenience + ⚠️ icon. */
export function isConcerning(q?: TesterQuality): boolean {
  return isHarshCritic(q) || isQualityFlagged(q);
}

const FLAG_LABELS: Record<TesterFlag['type'], string> = {
  harsh_critic: 'Harsh critic',
  overly_positive: 'Overly positive',
  straight_liner: 'Straight-liner',
};

export function flagLabel(type: TesterFlag['type']): string {
  return FLAG_LABELS[type];
}
