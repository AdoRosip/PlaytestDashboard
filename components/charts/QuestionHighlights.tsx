'use client';
import Link from 'next/link';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { scoreColor } from '@/lib/utils';

interface QuestionScore {
  id: string;
  text: string;
  score: number; // 0–100 normalized
  n: number;
}

interface Props {
  best: QuestionScore[];
  worst: QuestionScore[];
}

function Row({ item }: { item: QuestionScore }) {
  return (
    <Link
      href={`/questions/${item.id}`}
      className="flex items-center gap-3 px-2.5 py-1.5 rounded-lg hover:bg-slate-800/50 transition-colors group"
    >
      <span
        className="flex-1 min-w-0 text-xs text-slate-300 truncate group-hover:text-white transition-colors"
        title={item.text}
      >
        {item.text}
      </span>
      <span className={`text-sm font-bold tabular-nums flex-shrink-0 ${scoreColor(item.score)}`}>
        {item.score}
      </span>
    </Link>
  );
}

export default function QuestionHighlights({ best, worst }: Props) {
  const hasData = best.length > 0 || worst.length > 0;

  return (
    <div className="bg-slate-800/20 rounded-2xl border border-slate-700/60 p-5 h-full min-h-[260px] flex flex-col">
      <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-4">
        Best &amp; Worst Questions
      </div>

      {!hasData ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-sm text-slate-500">Not enough rated questions</div>
            <div className="text-[10px] text-slate-600 mt-1">
              Requires rating questions with at least 3 responses
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4 flex-1">
          {best.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5 px-2.5">
                <TrendingUp className="w-3 h-3 text-emerald-400" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                  Highest rated
                </span>
              </div>
              <div className="space-y-0.5">
                {best.map((item) => <Row key={item.id} item={item} />)}
              </div>
            </div>
          )}

          {worst.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5 px-2.5">
                <TrendingDown className="w-3 h-3 text-red-400" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-red-400">
                  Lowest rated
                </span>
              </div>
              <div className="space-y-0.5">
                {worst.map((item) => <Row key={item.id} item={item} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
