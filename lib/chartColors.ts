// ─────────────────────────────────────────────────────────────────────────────
// Semantic chart colour — bad is red, good is green.
//
// A plain red → yellow → green ramp, the usual scheme for ratings. Hue sweeps
// 0°→120° at fixed saturation and lightness, so every step is a vivid, fully
// saturated colour rather than a desaturated blend.
//
// THE ONE RULE THIS FILE EXISTS TO ENFORCE: polarity must be resolved before a
// colour is picked. `normalizedScore` (lib/scoring.ts) is always higher-is-better
// because inverse-scored questions are flipped there. RAW rating values are not —
// on "how frustrated were you?" a 5 is bad. Colouring a raw 5 green would state
// the opposite of the truth, so anything handed raw ratings takes `isInverseScored`.
//
// Deliberately untouched: category identity colours (lib/games/*.ts) and the geo
// map's ramp, which encodes tester *quantity*, not polarity — a red continent
// must not read as a bad continent.
// ─────────────────────────────────────────────────────────────────────────────

/** Colour for a polarity position: 0 = worst (red), 0.5 = mid (yellow), 1 = best (green). */
export function rampColor(position: number): string {
  const p = Math.max(0, Math.min(1, position));
  return `hsl(${Math.round(p * 120)}, 72%, 55%)`;
}

/** Fixed anchors for three-way splits (sentiment, yes/maybe/no). */
export const POLARITY = {
  bad: rampColor(0),
  neutral: rampColor(0.5),
  good: rampColor(1),
} as const;

/**
 * Bar colours for a rating distribution, indexed by `value - 1`.
 *
 * `isInverseScored` flips the ramp so green always means good: on a
 * negative-valence question a rating of 1 is the good end and comes out green.
 */
export function ratingColors(scale: 5 | 10, isInverseScored = false): string[] {
  return Array.from({ length: scale }, (_, i) => {
    const position = i / (scale - 1);
    return rampColor(isInverseScored ? 1 - position : position);
  });
}

/** Colour for an already-normalized 0–100 score (higher = better by definition). */
export function scoreHex(normalized: number): string {
  return rampColor(normalized / 100);
}
