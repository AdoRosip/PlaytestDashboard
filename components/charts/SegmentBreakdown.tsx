'use client';
import { useState } from 'react';
import type { Response, Tester, SegmentKey } from '@/lib/types';
import { SEGMENT_LABELS } from '@/lib/types';

interface Props {
  responses: Response[];
  testers: Tester[];
  scale: 5 | 10;
}

const BREAKDOWN_SEGMENTS: SegmentKey[] = [
  'age_group', 'gaming_hours', 'hardware_tier', 'country', 'gender',
];

export default function SegmentBreakdown({ responses, testers, scale }: Props) {
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

  if (rows.length < 2) return null;

  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-800/20 p-5 mb-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="text-sm font-semibold text-white">Score by Segment</div>
          <p className="text-xs text-slate-400 mt-0.5">Average rating broken down by tester profile</p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
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
      </div>

      <div className="space-y-2.5">
        {rows.map(({ label, avg, count }) => {
          const pct = (avg / scale) * 100;
          const barColor = pct >= 65 ? '#00FFFF' : pct >= 40 ? '#0066FF' : '#0000EE';
          return (
            <div key={label} className="flex items-center gap-3">
              <div
                className="w-36 text-xs text-slate-400 text-right truncate flex-shrink-0"
                title={label}
              >
                {label}
              </div>
              <div className="flex-1 h-4 bg-slate-700/40 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${pct}%`, backgroundColor: barColor + 'bb' }}
                />
              </div>
              <div className="w-8 text-xs font-semibold text-white text-right flex-shrink-0">
                {avg.toFixed(1)}
              </div>
              <div className="w-10 text-[10px] text-slate-500 text-right flex-shrink-0">
                n={count}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
