'use client';

interface Props {
  /** Mean answer, on the question's own scale (not normalized). */
  value: number;
  /** Top of the scale, e.g. 5 for a 1–5 rating. */
  max: number;
  /** Bottom of the scale. Ratings start at 1, so that is the default. */
  min?: number;
}

/**
 * Where an average sits on a rating scale.
 *
 * Fill is min–max normalized — `(value - min) / (max - min)` — matching
 * `computeNormalizedScore`, so this bar and the 0–100 category scores can never
 * disagree about the same answers.
 *
 * The ends are labelled with the actual scale bounds rather than a percentage.
 * On a 1–5 question the worst available answer is 1, and calling that "0%" or
 * "20%" both invite argument; showing it as the left end of a 1→5 track does not.
 */
export default function ScaleTrack({ value, max, min = 1 }: Props) {
  const span = max - min;
  const ratio = span > 0 ? (value - min) / span : 0;
  const pct = Math.max(0, Math.min(100, ratio * 100));

  // Interior ticks only — the ends are already marked by the labels.
  const ticks = Array.from({ length: Math.max(0, max - min - 1) }, (_, i) => ((i + 1) / span) * 100);

  return (
    <div>
      <div
        className="relative h-2 rounded-full bg-slate-700/50 overflow-hidden"
        role="img"
        aria-label={`Average ${value.toFixed(1)} on a ${min} to ${max} scale`}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-indigo-600/70 to-cyan-500/70"
          style={{ width: `${pct}%` }}
        />
        {ticks.map((left) => (
          <span
            key={left}
            className="absolute inset-y-0 w-px bg-slate-900/60"
            style={{ left: `${left}%` }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-slate-500 tabular-nums">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}
