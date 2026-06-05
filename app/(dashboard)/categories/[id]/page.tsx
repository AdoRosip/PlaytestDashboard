'use client';
import { use } from 'react';
import Link from 'next/link';
import { ArrowLeft, HelpCircle, MessageSquare } from 'lucide-react';
import { useDashboardStore } from '@/lib/store';
import PageHeader from '@/components/ui/PageHeader';
import Badge from '@/components/ui/Badge';
import ScoreBar from '@/components/ui/ScoreBar';
import { scoreColor, questionTypeLabel, computeRatingDistribution } from '@/lib/utils';
import RatingBarChart from '@/components/charts/RatingBarChart';

export default function CategoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const categories = useDashboardStore((s) => s.categories);
  const questions   = useDashboardStore((s) => s.questions);
  const responses   = useDashboardStore((s) => s.responses);
  const themes      = useDashboardStore((s) => s.themes);
  const openDrawer  = useDashboardStore((s) => s.openDrawer);

  const category = categories.find((c) => c.id === id);
  const catQuestions = questions.filter((q) => q.categoryId === id);
  const catThemes = themes.filter((t) => t.categoryId === id);

  if (!category) {
    return (
      <div className="px-8 py-8">
        <div className="text-slate-400 text-sm">Category not found.</div>
      </div>
    );
  }

  return (
    <div className="px-8 py-8 max-w-5xl">
      <div className="mb-6">
        <Link href="/categories" className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors mb-4">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to categories
        </Link>
        <PageHeader
          title={category.name}
          sub={`${catQuestions.length} questions · ${responses.filter((r) => catQuestions.some((q) => q.id === r.questionId)).length} responses`}
        />
      </div>

      {/* Themes for this category */}
      {catThemes.length > 0 && (
        <div className="mb-6 rounded-xl border border-slate-700/60 bg-slate-800/20 p-5">
          <h2 className="text-sm font-semibold text-white mb-3">Key Themes</h2>
          <div className="flex flex-wrap gap-2">
            {catThemes.map((t) => (
              <Link key={t.id} href={`/themes`}>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-700/60 bg-slate-900/50 hover:border-slate-500 transition-colors">
                  <Badge label={t.severity} severity={t.severity} variant="severity" />
                  <span className="text-xs text-slate-300">{t.label}</span>
                  <span className="text-xs text-slate-600">{t.frequency}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Questions */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-white">Questions</h2>
        {catQuestions.map((q) => {
          const qResponses = responses.filter((r) => r.questionId === q.id);
          const ratingResps = qResponses.filter((r) => r.numericValue !== null);
          const dist = ratingResps.length > 0
            ? computeRatingDistribution(ratingResps, q.type === 'rating_1_10' ? 10 : 5)
            : null;
          const freeTextResponses = qResponses.filter((r) => r.numericValue === null && r.rawAnswer);

          return (
            <div key={q.id} className="rounded-xl border border-slate-700/60 bg-slate-800/20 p-5">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="flex items-start gap-2 flex-1">
                  <HelpCircle className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-white leading-snug">{q.text}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <Badge label={questionTypeLabel(q.type)} variant="type" />
                      <span className="text-xs text-slate-500">{q.responseCount ?? qResponses.length} responses</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                  {q.avgScore !== undefined && (
                    <div className="text-right">
                      <div className={`text-xl font-bold ${scoreColor(
                        q.type === 'rating_1_5' ? ((q.avgScore - 1) / 4) * 100 : q.avgScore
                      )}`}>
                        {q.avgScore}
                      </div>
                      <div className="text-[10px] text-slate-500">avg</div>
                    </div>
                  )}
                  <Link
                    href={`/questions/${q.id}`}
                    className="px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-300 hover:text-white hover:border-slate-500 transition-colors"
                  >
                    Detail →
                  </Link>
                </div>
              </div>

              {/* Score bar for rating questions */}
              {q.lowScorePct !== undefined && (
                <div className="mb-4">
                  <ScoreBar
                    score={q.type === 'rating_1_5'
                      ? Math.round(((q.avgScore ?? 3) - 1) / 4 * 100)
                      : q.avgScore ?? 50}
                    height="h-2"
                  />
                  <div className="text-[10px] text-slate-500 mt-1">{q.lowScorePct}% low scores</div>
                </div>
              )}

              {/* Mini chart */}
              {dist && (
                <div>
                  <div className="text-[10px] text-slate-500 mb-2 uppercase tracking-wide">Rating distribution (click to explore)</div>
                  <RatingBarChart
                    data={dist}
                    scale={q.type === 'rating_1_10' ? 10 : 5}
                    onBarClick={(val) => openDrawer(q.id, val)}
                  />
                </div>
              )}

              {/* Free text preview */}
              {q.type === 'free_text' && freeTextResponses.length > 0 && (
                <div>
                  <div className="text-[10px] text-slate-500 mb-2 uppercase tracking-wide flex items-center gap-1">
                    <MessageSquare className="w-3 h-3" /> Sample responses
                  </div>
                  <div className="space-y-2">
                    {freeTextResponses.slice(0, 2).map((r) => (
                      <div key={r.id} className="text-xs text-slate-300 bg-slate-900/50 border border-slate-700/40 rounded p-3 leading-relaxed italic">
                        &ldquo;{r.rawAnswer}&rdquo;
                      </div>
                    ))}
                    {freeTextResponses.length > 2 && (
                      <Link href={`/questions/${q.id}`} className="text-xs text-indigo-400 hover:text-indigo-300">
                        +{freeTextResponses.length - 2} more responses →
                      </Link>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {catQuestions.length === 0 && (
          <div className="text-slate-500 text-sm text-center py-8">
            No questions assigned to this category yet.{' '}
            <Link href="/builder" className="text-indigo-400 hover:text-indigo-300">
              Open Category Builder →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
