'use client';
import { useMemo } from 'react';
import type { Tester } from '@/lib/types';
import { computeTesterSegments } from '@/lib/utils';

interface Props {
  testers: Tester[];
}

function DemoBar({ label, count, pct }: { label: string; count: number; pct: number }) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-2 mb-2">
      <div>
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-[10px] text-slate-400 truncate">{label}</span>
          <span className="text-[10px] text-slate-500 ml-2 flex-shrink-0">{count}</span>
        </div>
        <div className="h-1.5 rounded-full bg-slate-700/60 overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{
              width: `${pct}%`,
              background: 'linear-gradient(90deg, #0066FF, #00FFFF)',
            }}
          />
        </div>
      </div>
    </div>
  );
}

export default function PlayerDemoWidget({ testers }: Props) {
  const segments = useMemo(() => computeTesterSegments(testers), [testers]);

  if (testers.length === 0) {
    return (
      <div className="bg-slate-800/20 rounded-2xl border border-slate-700/60 p-5 flex items-center justify-center min-h-[200px]">
        <p className="text-sm text-slate-500">No tester data</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/20 rounded-2xl border border-slate-700/60 p-5">
      <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-4">
        Who Are Your Players?
      </div>

      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-full bg-indigo-900/40 flex items-center justify-center flex-shrink-0">
          <span className="text-sm font-bold text-indigo-400">{testers.length}</span>
        </div>
        <span className="text-xs text-slate-400">testers participated</span>
      </div>

      {segments.gamerTypes.length > 0 && (
        <div className="mb-4">
          <div className="text-[10px] uppercase tracking-widest text-slate-600 mb-2">Gamer Type</div>
          {segments.gamerTypes.slice(0, 4).map(row => (
            <DemoBar key={row.label} {...row} />
          ))}
        </div>
      )}

      {segments.ageGroups.filter(r => r.label !== 'Unknown').length > 0 && (
        <div className="mb-4">
          <div className="text-[10px] uppercase tracking-widest text-slate-600 mb-2">Age Group</div>
          {segments.ageGroups.filter(r => r.label !== 'Unknown').slice(0, 4).map(row => (
            <DemoBar key={row.label} {...row} />
          ))}
        </div>
      )}

      {segments.hardwareTiers.filter(r => r.label !== 'Unknown').length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-slate-600 mb-2">Hardware Tier</div>
          {segments.hardwareTiers.filter(r => r.label !== 'Unknown').slice(0, 3).map(row => (
            <DemoBar key={row.label} {...row} />
          ))}
        </div>
      )}
    </div>
  );
}
