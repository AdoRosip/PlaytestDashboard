'use client';
import { useState } from 'react';
import type { Response, Tester, SegmentKey } from '@/lib/types';
import { SEGMENT_LABELS } from '@/lib/types';
import { scoreHex } from '@/lib/chartColors';
import CollapsibleSection from '@/components/ui/CollapsibleSection';

interface Props {
  responses: Response[];
  testers: Tester[];
  scale: 5 | 10;
  // `avg` below is built from raw `numericValue`, which is NOT polarity-corrected
  // (unlike `normalizedScore`). The bars are coloured good-green/bad-red, so an
  // inverse-scored question needs the polarity flipped before a colour is picked
  // — otherwise the worst-performing segment is painted green.
  isInverseScored?: boolean;
}

const BREAKDOWN_SEGMENTS: SegmentKey[] = [
  'age_group', 'gaming_hours', 'hardware_tier', 'country', 'gender',
];

export default function SegmentBreakdown({ responses, testers, scale, isInverseScored = false }: Props) {
  const [activeKey, setActiveKey] = useState<SegmentKey>('age_group');

  const testerMap = new Map(testers.map((t) => [t.id, t]));

  const groups = new Map<string, number[]>();
  for (const r of responses) {
    if (r.numericValue === null || !r.testerId) continue;
    const seg = testerMap.get(r.testerId)?.segments[activeKey];
    if (!seg) continue;
    const bucket = groups.get(seg) ?? [];
    bucket.push(r.numericValue);
    groups.set(seg, bucket);
  }

  const rows = Array.from(groups.entries())
    .map(([label, scores]) => ({
      label,
      avg: scores.reduce((a, b) => a + b, 0) / scores.length,
      count: scores.length,
    }))
    .sort((a, b) => b.avg - a.avg);

  return (
    <CollapsibleSection
      title="Score by Segment"
      description="Average rating broken down by tester profile"
      className="mb-6"
    >
      <div className="flex flex-wrap items-center justify-end gap-1.5 mb-4">
          {BREAKDOWN_SEGMENTS.map((key) => (
            <button
              key={key}
              onClick={() => setActiveKey(key)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors border ${
                activeKey === key
                  ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-300'
                  : 'border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600'
              }`}
            >
              {SEGMENT_LABELS[key]}
            </button>
          ))}
      </div>

      <div className="space-y-2.5">
        {rows.length < 2 && (
          <p className="text-xs text-slate-500 py-3 text-center">
            Not enough populated groups for {SEGMENT_LABELS[activeKey]}. Try another segment.
          </p>
        )}
        {rows.map(({ label, avg, count }) => {
          const pct = (avg / scale) * 100;
          // Bar *width* stays on the raw percentage — it shows the score itself.
          // Only the colour reads polarity, so only the colour is flipped.
          const barColor = scoreHex(isInverseScored ? 100 - pct : pct);
          return (
            <div key={label} className="flex items-center gap-3">
              <div
                className="w-36 text-xs text-slate-400 text-right truncate flex-shrink-0"
                title={label}
              >
                {label}
              </div>
              <div className="flex-1 h-4 bg-slate-700/40 rounded-full overflow-hidden">
                {/* `scoreHex` returns an `hsl()` string despite the name, so the
                    old `barColor + 'bb'` alpha suffix built `hsl(…)bb` — not a
                    colour, which browsers drop, leaving every bar invisible.
                    The same softening now comes from opacity. */}
                <div
                  className="h-full rounded-full opacity-[0.73] transition-all duration-300"
                  style={{ width: `${pct}%`, backgroundColor: barColor }}
                />
              </div>
              <div className="w-8 font-mono text-xs font-semibold text-white text-right flex-shrink-0">
                {avg.toFixed(1)}
              </div>
              <div className="w-10 font-mono text-[10px] text-slate-500 text-right flex-shrink-0">
                n={count}
              </div>
            </div>
          );
        })}
      </div>
    </CollapsibleSection>
  );
}
