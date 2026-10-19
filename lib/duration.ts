import type { FilterState, Question, Response } from './types';

/** Portal Duration answers are numeric minutes, not rating points or hours. */
export function parseDurationMinutes(raw: string): number | null {
  const value = raw.trim();
  if (!/^\d+(?:\.\d+)?$/.test(value)) return null;
  const minutes = Number(value);
  return Number.isFinite(minutes) ? minutes : null;
}

export function formatDurationMinutes(minutes: number): string {
  const total = Math.round(minutes);
  const hours = Math.floor(total / 60);
  const remainder = total % 60;
  return hours ? `${hours}h${remainder ? ` ${remainder}m` : ''}` : `${remainder}m`;
}

/**
 * The question that records how long a tester played: the form's Duration
 * question when it has one, otherwise the first question whose text matches
 * `pattern` (older forms asked for hours in a plain number question).
 */
export function findPlaytimeQuestion(questions: Question[], pattern?: RegExp): Question | undefined {
  return questions.find((q) => q.type === 'duration') ?? (pattern && questions.find((q) => pattern.test(q.text)));
}

/** A playtime answer in hours: Duration answers are minutes, other questions already report hours. */
export function playtimeHours(
  question: Pick<Question, 'type'>,
  response: Pick<Response, 'rawAnswer' | 'numericValue'>,
): number | null {
  if (question.type !== 'duration') return response.numericValue;
  const minutes = parseDurationMinutes(response.rawAnswer);
  return minutes === null ? null : minutes / 60;
}

export type PlaytimeBucket = NonNullable<FilterState['sessionPlaytime']>;

export const PLAYTIME_BUCKETS: { label: string; value: PlaytimeBucket }[] = [
  { label: '< 1h', value: '<1h' },
  { label: '1–3h', value: '1-3h' },
  { label: '3–6h', value: '3-6h' },
  { label: '6h+',  value: '6h+' },
];

/** Bucket bounds: 1h and 3h fall in 1–3h, 6h in 3–6h. */
export function playtimeBucket(hours: number): PlaytimeBucket {
  return hours < 1 ? '<1h' : hours <= 3 ? '1-3h' : hours <= 6 ? '3-6h' : '6h+';
}

/**
 * Duration answers per playtime band, labelled like the Time Played filter so a
 * clicked bar's label is also its cross-filter value. Percentages are of the
 * answers that parse as minutes.
 */
export function durationDistribution(responses: Pick<Response, 'rawAnswer'>[]): { label: string; count: number; pct: number }[] {
  const hours = responses.flatMap((r) => {
    const minutes = parseDurationMinutes(r.rawAnswer);
    return minutes === null ? [] : [minutes / 60];
  });
  return PLAYTIME_BUCKETS.map(({ label, value }) => {
    const count = hours.filter((h) => playtimeBucket(h) === value).length;
    return { label, count, pct: hours.length ? Math.round((count / hours.length) * 100) : 0 };
  });
}
