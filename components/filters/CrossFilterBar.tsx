'use client';
import { Filter, X } from 'lucide-react';
import { useDashboardStore, selectFilteredTesterIds, selectCrossFilterCount } from '@/lib/store';

function shortenQuestion(text: string): string {
  return text.length > 42 ? `${text.slice(0, 42).trimEnd()}…` : text;
}

/**
 * The active cross-filter constraints, rendered by `DashboardShell` so they are
 * visible on every page rather than only on the one where they were clicked.
 *
 * This bar is the counterweight to making the cross-filter global (item 19): a
 * constraint set on one category now silently narrows every other page, so the
 * reason has to travel with it. Each chip names its question and removes just
 * that constraint; the count is the final cohort, after the filter panel, so it
 * always matches what the page below is actually showing.
 */
export default function CrossFilterBar() {
  const drill = useDashboardStore((s) => s.drill);
  const questions = useDashboardStore((s) => s.questions);
  const clearDrill = useDashboardStore((s) => s.clearDrill);
  const clearDrillQuestion = useDashboardStore((s) => s.clearDrillQuestion);
  const crossFilterCount = useDashboardStore(selectCrossFilterCount);
  const cohortSize = useDashboardStore((s) => selectFilteredTesterIds(s)?.size ?? null);

  if (crossFilterCount === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 md:px-6 py-2 bg-indigo-900/25 border-b border-indigo-700/30">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-200 flex-shrink-0">
        <Filter className="w-3.5 h-3.5 text-indigo-400" />
        Cross-filter ·{' '}
        <span className="text-white">
          {cohortSize ?? 0} matching {cohortSize === 1 ? 'tester' : 'testers'}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 min-w-0">
        {Object.entries(drill).map(([qid, values]) => {
          const q = questions.find((x) => x.id === qid);
          return (
            <button
              key={qid}
              onClick={() => clearDrillQuestion(qid)}
              title={q ? `Remove filter: ${q.text}` : 'Remove this filter'}
              className="group flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-indigo-400/40 bg-slate-900/60 hover:border-indigo-300 transition-colors"
            >
              <span className="text-xs text-slate-300">
                {q ? shortenQuestion(q.text) : qid} ={' '}
                <span className="font-semibold text-white">{values.join(' or ')}</span>
              </span>
              <X className="w-3 h-3 text-slate-500 group-hover:text-white" />
            </button>
          );
        })}
      </div>

      <button
        onClick={clearDrill}
        className="ml-auto flex items-center gap-1 text-xs text-indigo-400 hover:text-white transition-colors flex-shrink-0"
      >
        <X className="w-3 h-3" /> Clear cross-filter
      </button>
    </div>
  );
}
