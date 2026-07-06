import type { Question, Response, Tester } from './types';
import type { GameConfig } from './games';

// ─────────────────────────────────────────────────────────────────────────────
// Tester-quality intel derived from registry taste (genres/playstyles) and from
// the tester's own feedback effort. The product goal is to help clients tell
// reliable, invested testers from low-effort ones — not just demographics.
// All functions here are pure and unit-tested.
// ─────────────────────────────────────────────────────────────────────────────

/** Split a comma-joined multi-select answer into clean tokens. */
export function splitMulti(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(',').map((v) => v.trim()).filter(Boolean);
}

export function testerGenres(tester: Tester): string[] {
  return splitMulti(tester.segments.genres);
}

export function testerPlaystyles(tester: Tester): string[] {
  return splitMulti(tester.segments.playstyles);
}

export interface GenreFit {
  /** The game's declared target genres (labels). */
  target: string[];
  /** Target genres this tester actually plays. */
  matched: string[];
  /** matched / target (0–1); 0 when the game declares no target genres. */
  score: number;
  /** True when the tester plays at least one target genre. */
  isFit: boolean;
  /** True when the tester's genre data is unknown (not in the Type-of-Gamer file). */
  unknown: boolean;
}

/**
 * How well a tester's genre taste matches the game's target audience. Matching
 * is done against the raw comma-joined genres string so parenthetical suffixes
 * (e.g. "Simulation / Cozy (e.g. House Flipper…)") don't break equality.
 */
export function genreFit(tester: Tester, config: GameConfig): GenreFit {
  const target = (config.targetGenres ?? []).map((g) => g.label);
  const raw = tester.segments.genres ?? '';
  const unknown = raw.trim().length === 0;

  const matched = (config.targetGenres ?? [])
    .filter((g) => g.match.test(raw))
    .map((g) => g.label);

  return {
    target,
    matched,
    score: target.length ? matched.length / target.length : 0,
    isFit: matched.length > 0,
    unknown,
  };
}

export type EngagementTier = 'detailed' | 'brief' | 'minimal' | 'none';

export interface Engagement {
  /** Free-text questions in the form. */
  freeTextTotal: number;
  /** Free-text questions this tester answered substantively. */
  answered: number;
  /** answered / freeTextTotal (0–1). */
  answeredRatio: number;
  /** Average word count across answered free-text questions. */
  avgWords: number;
  tier: EngagementTier;
}

// Tunable thresholds — kept here so the logic below has no magic numbers.
export const ENGAGEMENT_CONFIG = {
  /** Answers shorter than this (chars) are treated as non-substantive (e.g. "no", "n/a"). */
  minChars: 3,
  detailed: { ratio: 0.6, avgWords: 15 },
  brief: { ratio: 0.4, avgWords: 5 },
};

const NON_ANSWERS = new Set(['no', 'n/a', 'na', 'none', 'nope', 'nothing', 'idk', '-', '.']);

function wordCount(s: string): number {
  const t = s.trim();
  return t ? t.split(/\s+/).length : 0;
}

/**
 * Measure how much genuine written feedback a tester gave. This is the core
 * "worth-the-time" signal: someone who answers most free-text questions with
 * real detail is a more valuable tester than someone who types "no" everywhere.
 */
export function engagement(testerId: string, responses: Response[], questions: Question[]): Engagement {
  const freeTextIds = new Set(questions.filter((q) => q.type === 'free_text').map((q) => q.id));
  const freeTextTotal = freeTextIds.size;

  const answers = responses.filter((r) => r.testerId === testerId && freeTextIds.has(r.questionId));
  const substantive = answers.filter((r) => {
    const a = r.rawAnswer.trim();
    return a.length >= ENGAGEMENT_CONFIG.minChars && !NON_ANSWERS.has(a.toLowerCase());
  });

  const answered = substantive.length;
  const totalWords = substantive.reduce((sum, r) => sum + wordCount(r.rawAnswer), 0);
  const avgWords = answered ? totalWords / answered : 0;
  const answeredRatio = freeTextTotal ? answered / freeTextTotal : 0;

  let tier: EngagementTier;
  if (answered === 0) tier = 'none';
  else if (answeredRatio >= ENGAGEMENT_CONFIG.detailed.ratio && avgWords >= ENGAGEMENT_CONFIG.detailed.avgWords) tier = 'detailed';
  else if (answeredRatio >= ENGAGEMENT_CONFIG.brief.ratio && avgWords >= ENGAGEMENT_CONFIG.brief.avgWords) tier = 'brief';
  else tier = 'minimal';

  return { freeTextTotal, answered, answeredRatio, avgWords, tier };
}

export const ENGAGEMENT_LABELS: Record<EngagementTier, string> = {
  detailed: 'Detailed responder',
  brief: 'Brief responder',
  minimal: 'Low-effort',
  none: 'No written feedback',
};
