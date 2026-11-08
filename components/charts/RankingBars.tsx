'use client';
import { useState } from 'react';
import { ordinal, rankDrillValue, type RankingResult } from '@/lib/ranking';
import RankingMatrix from './RankingMatrix';

interface RankingBarsProps {
  result: RankingResult;
  /** Selected drill values ("Long intro #1"); those segments get a ring. */
  selectedValues?: string[];
  onCellClick?: (value: string) => void;
}

// Places are ordered, so they share one hue (the dashboard's cyan) stepped from
// strong (1st) to faint (last). Segment widths carry the reading; colour only
// says which place a segment is, and the legend and labels name it too.
function placeAlpha(place: number, places: number) {
  if (places <= 1) return 0.9;
  return 0.9 - (0.75 * (place - 1)) / (places - 1);
}
const fill = (place: number, places: number) => `rgba(0, 255, 255, ${placeAlpha(place, places).toFixed(3)})`;
const ink = (place: number, places: number) => (placeAlpha(place, places) >= 0.5 ? '#0B1021' : 'rgba(255,255,255,0.88)');

/**
 * One 100% bar per ranked item, split by the place testers gave it: "40% put
 * Long intro 1st, 50% 2nd…". Items are ordered by average place, best first.
 * Clicking a segment cross-filters the page to the testers behind it. A
 * "Heatmap" tab shows the same numbers as an item × place grid.
 */
export default function RankingBars({ result, selectedValues = [], onCellClick }: RankingBarsProps) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const viewLabels = { chart: 'Bar chart', table: 'Heatmap' } as const;
  const places = Array.from({ length: result.places }, (_, i) => i + 1);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400" aria-hidden={view === 'table'}>
          {view === 'chart' && places.map((p) => (
            <span key={p} className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ background: fill(p, result.places) }} />
              {ordinal(p)}
            </span>
          ))}
        </div>
        <div className="flex rounded-md border border-slate-700/60 p-0.5 text-[11px]" role="group" aria-label="Ranking view">
          {(['chart', 'table'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={`px-2 py-0.5 rounded ${view === v ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              {viewLabels[v]}
            </button>
          ))}
        </div>
      </div>

      {view === 'table' ? (
        <RankingMatrix result={result} selectedValues={selectedValues} onCellClick={onCellClick} />
      ) : (
        <ul className="space-y-3 sm:space-y-2" aria-label="Places each item was given">
          <li className="hidden sm:grid grid-cols-[minmax(6rem,12rem)_1fr_4rem] gap-x-4 text-[10px] uppercase tracking-wide text-slate-500" aria-hidden>
            <span>Ranked</span>
            <span>Share of testers by place</span>
            <span className="text-right">Avg place</span>
          </li>
          {result.items.map((item) => (
            <li
              key={item.name}
              className="grid grid-cols-[1fr_auto] sm:grid-cols-[minmax(6rem,12rem)_1fr_4rem] items-center gap-x-4 gap-y-1"
            >
              <span className="order-1 text-xs sm:text-sm font-medium text-slate-200 truncate" title={item.name}>
                {item.name}
              </span>
              <span className="order-2 sm:order-3 text-right font-mono text-xs sm:text-sm tabular-nums text-white">
                <span className="sm:hidden text-slate-500 font-sans">avg </span>
                {item.avgPlace === null ? '–' : item.avgPlace.toFixed(1)}
              </span>
              <div className="order-3 sm:order-2 col-span-2 sm:col-span-1 flex h-8 gap-[2px]">
                {places.map((p) => {
                  const count = item.counts[p - 1];
                  if (!count) return null;
                  const pct = item.pcts[p - 1];
                  const value = rankDrillValue(item.name, p);
                  const selected = selectedValues.includes(value);
                  const label = `${item.name} ranked ${ordinal(p)} by ${count} of ${result.n} testers (${pct}%)`;
                  const style = {
                    flexGrow: count,
                    flexBasis: 0,
                    background: fill(p, result.places),
                    color: ink(p, result.places),
                    boxShadow: selected ? 'inset 0 0 0 2px #FFFFFF' : undefined,
                  };
                  // Label a segment only when it is wide enough to hold its number.
                  const text = (
                    <span className={`font-mono text-[11px] sm:text-xs tabular-nums ${pct >= 15 ? '' : pct >= 8 ? 'hidden sm:inline' : 'hidden'}`}>
                      {pct}%
                    </span>
                  );
                  const className = 'min-w-0 rounded-[4px] flex items-center justify-center overflow-hidden';
                  return onCellClick ? (
                    <button
                      key={p}
                      type="button"
                      onClick={() => onCellClick(value)}
                      title={`${label} · click to show only these testers`}
                      aria-label={label}
                      aria-pressed={selected}
                      className={`${className} transition-[filter] hover:brightness-125 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white`}
                      style={style}
                    >
                      {text}
                    </button>
                  ) : (
                    <div key={p} className={className} style={style} title={label} aria-label={label} role="img">
                      {text}
                    </div>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
