import { ThumbsDown, ThumbsUp } from 'lucide-react';
import type { QuestionAnalysisResult } from '@/app/api/question-analysis/route';

/** Per-item "liked / disliked" cards from a ranking-aware AI analysis. */
export default function OptionInsights({ insights, order, compact = false }: {
  insights: NonNullable<QuestionAnalysisResult['optionInsights']>;
  /** Item names in the order to show them, e.g. by average place. */
  order?: string[];
  /** One column, for narrow side panels. */
  compact?: boolean;
}) {
  const rank = (name: string) => {
    const i = order?.indexOf(name) ?? -1;
    return i < 0 ? Infinity : i;
  };
  const sorted = [...insights].sort((a, b) => rank(a.option) - rank(b.option));
  if (!sorted.length) return null;
  return (
    <div className={`grid grid-cols-1 gap-3 ${compact ? '' : 'md:grid-cols-2'}`}>
      {sorted.map((o) => (
        <div key={o.option} className="rounded-lg border border-slate-700/50 bg-slate-900/40 p-3">
          <div className="text-sm font-semibold text-white mb-2">{o.option}</div>
          {o.liked && (
            <div className="flex gap-2 text-xs text-slate-300 leading-relaxed mb-1.5">
              <ThumbsUp className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" aria-label="Liked" />
              <span>{o.liked}</span>
            </div>
          )}
          {o.disliked && (
            <div className="flex gap-2 text-xs text-slate-300 leading-relaxed">
              <ThumbsDown className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" aria-label="Disliked" />
              <span>{o.disliked}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
