import type { Question, Response } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic transforms that turn a qualitative-heavy feedback form into
// meaningful, chartable signal — no AI required. Used by the qualitative
// overview. All pure and unit-tested.
// ─────────────────────────────────────────────────────────────────────────────

export interface Bucket {
  label: string;
  count: number;
  pct: number;
}

/** Count distinct answers, sorted most-common first. */
export function distributionOf(values: string[]): Bucket[] {
  const clean = values.map((v) => v.trim()).filter(Boolean);
  const total = clean.length;
  const counts = new Map<string, number>();
  for (const v of clean) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count, pct: total ? Math.round((count / total) * 100) : 0 }))
    .sort((a, b) => b.count - a.count);
}

export type LeadSentiment = 'yes' | 'no' | 'maybe' | 'other';

const YES_RE = /^(yes|yeah|yep|yup|sure|definitely|absolutely|of course|for sure|i (would|do|did|think so))\b/i;
const NO_RE = /^(no|nope|nah|not (really|at all|much)|never|none)\b/i;
const MAYBE_RE = /^(maybe|kinda|kind of|sort of|somewhat|possibly|perhaps|a (little|bit)|it depends|depends|mixed|so-so|not sure)\b/i;

/** Classify a free-text answer by its leading word — many "prose" questions are
 *  really yes/no/maybe questions with an explanation attached. */
export function classifyLead(answer: string): LeadSentiment {
  const t = answer.trim().toLowerCase();
  if (!t) return 'other';
  if (MAYBE_RE.test(t)) return 'maybe'; // check maybe first ("not sure" shouldn't read as no)
  if (YES_RE.test(t)) return 'yes';
  if (NO_RE.test(t)) return 'no';
  return 'other';
}

export interface SemiStructured {
  yes: number;
  no: number;
  maybe: number;
  other: number;
  total: number;
  /** Share of answers that were classifiable as yes/no/maybe (0–1). */
  classifiedRatio: number;
}

/** Aggregate a free-text question's answers into yes/no/maybe/other counts. */
export function semiStructured(answers: string[]): SemiStructured {
  const clean = answers.map((a) => a.trim()).filter(Boolean);
  const out = { yes: 0, no: 0, maybe: 0, other: 0, total: clean.length, classifiedRatio: 0 };
  for (const a of clean) out[classifyLead(a)]++;
  out.classifiedRatio = clean.length ? (out.yes + out.no + out.maybe) / clean.length : 0;
  return out;
}

export interface RatingBucket {
  value: number;
  count: number;
  pct: number;
}

/** Distribution across 1..max for a rating question. */
export function ratingDistribution(values: number[], max: number): RatingBucket[] {
  const total = values.length;
  const out: RatingBucket[] = [];
  for (let v = 1; v <= max; v++) {
    const count = values.filter((x) => Math.round(x) === v).length;
    out.push({ value: v, count, pct: total ? Math.round((count / total) * 100) : 0 });
  }
  return out;
}

export interface RatingSentiment {
  avg: number;
  n: number;
  positive: number; // %
  neutral: number;  // %
  negative: number; // %
}

export function ratingSentiment(values: number[], max: number): RatingSentiment | null {
  if (!values.length) return null;
  const pos = values.filter((v) => v / max >= 0.6).length;
  const neg = values.filter((v) => v / max < 0.35).length;
  const p = (n: number) => Math.round((n / values.length) * 100);
  return {
    avg: values.reduce((a, b) => a + b, 0) / values.length,
    n: values.length,
    positive: p(pos),
    neutral: p(values.length - pos - neg),
    negative: p(neg),
  };
}

/** Numeric answers to a question (rating questions). */
export function numericAnswers(responses: Response[], questionId: string): number[] {
  return responses
    .filter((r) => r.questionId === questionId && r.numericValue !== null)
    .map((r) => r.numericValue!);
}

/** Raw text answers to a question. */
export function textAnswers(responses: Response[], questionId: string): string[] {
  return responses.filter((r) => r.questionId === questionId).map((r) => r.rawAnswer);
}

/** Is this a question we should render as a choice-demand bar? */
export function isChoiceQuestion(q: Question): boolean {
  return q.type === 'yes_no' || q.type === 'multiple_choice';
}
