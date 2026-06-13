'use client';
import Link from 'next/link';
import { HelpCircle } from 'lucide-react';
import { useDashboardStore, selectFilteredResponses } from '@/lib/store';
import PageHeader from '@/components/ui/PageHeader';
import Badge from '@/components/ui/Badge';
import ScoreBar from '@/components/ui/ScoreBar';
import EmptyState from '@/components/ui/EmptyState';
import { questionTypeLabel, scoreColor } from '@/lib/utils';

export default function QuestionsPage() {
  const questions   = useDashboardStore((s) => s.questions);
  const categories  = useDashboardStore((s) => s.categories);
  const responses   = useDashboardStore(selectFilteredResponses);

  if (!questions.length) {
    return (
      <div className="px-8 py-8">
        <PageHeader title="Questions" sub="All detected survey questions" />
        <EmptyState icon={HelpCircle} title="No questions yet" description="Upload playtest data to see questions." />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1680px] px-6 lg:px-8 py-8">
      <PageHeader title="Questions" sub={`${questions.length} questions detected`} />

      <div className="grid grid-cols-1 2xl:grid-cols-2 gap-2">
        {questions.map((q) => {
          const cat = categories.find((c) => c.id === q.categoryId);
          const qResponses = responses.filter((r) => r.questionId === q.id);
          const ratingResponses = qResponses.filter((r) => r.normalizedScore !== null);
          const avgNorm = ratingResponses.length
            ? Math.round(ratingResponses.reduce((s, r) => s + (r.normalizedScore ?? 0), 0) / ratingResponses.length)
            : null;

          return (
            <Link
              key={q.id}
              href={`/questions/${q.id}`}
              className="flex items-center gap-4 rounded-xl border border-slate-700/60 bg-slate-800/20 px-5 py-4 hover:border-slate-600 hover:bg-slate-800/40 transition-colors group"
            >
              <HelpCircle className="w-4 h-4 text-slate-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-200 truncate group-hover:text-white transition-colors">{q.text}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge label={questionTypeLabel(q.type)} variant="type" />
                  {cat && (
                    <Badge label={cat.name} variant="accent" />
                  )}
                  <span className="text-xs text-slate-500">{qResponses.length} responses</span>
                </div>
              </div>

              {avgNorm !== null && (
                <div className="w-24 flex-shrink-0">
                  <ScoreBar score={avgNorm} height="h-1.5" />
                </div>
              )}

              {q.avgScore !== undefined && (
                <div className={`text-sm font-semibold w-8 text-right flex-shrink-0 ${scoreColor(avgNorm ?? 50)}`}>
                  {q.avgScore}
                </div>
              )}

              <span className="text-xs text-slate-600 group-hover:text-indigo-400 transition-colors flex-shrink-0">→</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
