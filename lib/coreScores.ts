// Layout split for the overview's "Core experience scores" section: the two
// strongest and two weakest categories get rings, everything else a ranked list.

export interface ScoredCategory {
  name: string;
  score: number; // 0–100
}

export type CoreScoresLayout<T extends ScoredCategory> =
  | { kind: 'row'; all: T[] }
  | { kind: 'split'; strongest: T[]; weakest: T[]; rest: T[] };

/** At or below this many categories every one is shown as a ring. */
export const ALL_RINGS_MAX = 5;

export function splitCoreScores<T extends ScoredCategory>(categories: T[]): CoreScoresLayout<T> {
  const sorted = [...categories].sort((a, b) => b.score - a.score);
  if (sorted.length <= ALL_RINGS_MAX) return { kind: 'row', all: sorted };
  return {
    kind: 'split',
    strongest: sorted.slice(0, 2),
    weakest: sorted.slice(-2).reverse(), // lowest first
    rest: sorted.slice(2, -2),
  };
}

export function scoreBandColor(score: number): string {
  if (score >= 70) return '#7ED957';
  if (score >= 50) return '#E8C547';
  return '#F26D6D';
}
