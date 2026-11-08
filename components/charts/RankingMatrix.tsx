'use client';
import { ordinal, rankDrillValue, type RankingResult } from '@/lib/ranking';

interface RankingMatrixProps {
  result: RankingResult;
  /** Selected drill values ("Long intro #1"); those cells get a ring. */
  selectedValues?: string[];
  onCellClick?: (value: string) => void;
}

// One sequential hue (the dashboard's cyan): a cell's fill says what share of
// testers put that item in that place. Every cell also prints its percentage,
// so the reading never depends on colour alone.
const fill = (pct: number) => `rgba(0, 255, 255, ${(0.06 + 0.74 * (pct / 100)).toFixed(3)})`;

/**
 * Item × place table for a ranking question: "40% put Long intro 1st". Rows are
 * ordered by average place, best first. Clicking a cell cross-filters the page
 * to the testers behind it.
 */
export default function RankingMatrix({ result, selectedValues = [], onCellClick }: RankingMatrixProps) {
  const places = Array.from({ length: result.places }, (_, i) => i + 1);
  return (
    <div className="overflow-x-auto">
      <table className="w-full table-fixed border-separate" style={{ borderSpacing: 2 }}>
        <caption className="sr-only">Share of testers who put each item in each place</caption>
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-slate-500">
            <th scope="col" className="w-24 sm:w-48 text-left font-semibold pb-1 pr-2">Ranked</th>
            {places.map((p) => (
              <th key={p} scope="col" className="font-semibold pb-1">{ordinal(p)}</th>
            ))}
            <th scope="col" className="font-semibold pb-1 pl-2 text-right whitespace-nowrap w-12 sm:w-20">Avg<span className="hidden sm:inline"> place</span></th>
          </tr>
        </thead>
        <tbody>
          {result.items.map((item) => (
            <tr key={item.name}>
              <th scope="row" className="text-left text-xs sm:text-sm font-medium text-slate-200 pr-2 sm:pr-4 py-0.5 truncate" title={item.name}>
                {item.name}
              </th>
              {places.map((p) => {
                const pct = item.pcts[p - 1];
                const count = item.counts[p - 1];
                const value = rankDrillValue(item.name, p);
                const selected = selectedValues.includes(value);
                const label = `${item.name} ranked ${ordinal(p)} by ${count} of ${result.n} testers (${pct}%)`;
                const content = <span className="font-mono text-xs sm:text-sm tabular-nums">{pct}%</span>;
                const style = {
                  background: fill(pct),
                  color: pct >= 45 ? '#0B1021' : 'rgba(255,255,255,0.82)',
                  boxShadow: selected ? 'inset 0 0 0 2px #FFFFFF' : undefined,
                };
                return (
                  <td key={p} className="p-0">
                    {onCellClick ? (
                      <button
                        type="button"
                        onClick={() => onCellClick(value)}
                        title={`${label} · click to show only these testers`}
                        aria-label={label}
                        aria-pressed={selected}
                        className="w-full h-10 rounded flex items-center justify-center transition-[filter] hover:brightness-125 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
                        style={style}
                      >
                        {content}
                      </button>
                    ) : (
                      <div className="w-full h-10 rounded flex items-center justify-center" style={style} title={label}>{content}</div>
                    )}
                  </td>
                );
              })}
              <td className="pl-2 text-right font-mono text-sm tabular-nums text-white">
                {item.avgPlace === null ? '–' : item.avgPlace.toFixed(1)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
