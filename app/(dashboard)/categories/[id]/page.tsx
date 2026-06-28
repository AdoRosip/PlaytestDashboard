'use client';
import { use, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, HelpCircle, MessageSquare, X, Filter, Sparkles } from 'lucide-react';
import { useDashboardStore, selectFilteredResponses } from '@/lib/store';
import PageHeader from '@/components/ui/PageHeader';
import Badge from '@/components/ui/Badge';
import ScoreBar from '@/components/ui/ScoreBar';
import QuestionSummaryDialog from '@/components/ui/QuestionSummaryDialog';
import { scoreColor, questionTypeLabel, computeRatingDistribution } from '@/lib/utils';
import { isRatingType } from '@/lib/scoring';
import RatingBarChart from '@/components/charts/RatingBarChart';
import { countRespondents } from '@/lib/responseStats';
import {
  buildPerQuestionSets,
  matchingTesterIds,
  applyDrill as applyDrillIds,
  toggleDrill as toggleDrillSelection,
  removeDrill as removeDrillSelection,
  type DrillSelection,
} from '@/lib/crossFilter';
import type { Question, Response } from '@/lib/types';

function shortenQuestion(text: string): string {
  return text.length > 42 ? `${text.slice(0, 42).trimEnd()}…` : text;
}

export default function CategoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const categories = useDashboardStore((s) => s.categories);
  const questions   = useDashboardStore((s) => s.questions);
  const responses   = useDashboardStore(selectFilteredResponses);
  const testers     = useDashboardStore((s) => s.testers);
  const themes      = useDashboardStore((s) => s.themes);
  // const openDrawer = useDashboardStore((s) => s.openDrawer); // side panel disabled
  //   on the category page — bar clicks now drive the in-category drill-down below.

  // ── In-category cross-question drill-down ──────────────────────────────────
  // Page-local (resets on navigation), layered on top of the global filters.
  // Pure logic lives in `lib/crossFilter.ts`; this component only owns state.
  const [drill, setDrill] = useState<DrillSelection>({});

  // Question whose AI summary dialog is open (null = closed).
  const [summaryQ, setSummaryQ] = useState<Question | null>(null);

  const toggleDrill = (questionId: string, value: number) =>
    setDrill((d) => toggleDrillSelection(d, questionId, value));
  const removeDrill = (questionId: string) =>
    setDrill((d) => removeDrillSelection(d, questionId));
  const clearDrill = () => setDrill({});

  const category = categories.find((c) => c.id === id);
  const catQuestions = questions.filter((q) => q.categoryId === id);
  const catResponses = responses.filter((r) => catQuestions.some((q) => q.id === r.questionId));
  const catThemes = themes.filter((t) => t.categoryId === id);

  // Tester-ID set for each drilled question, derived from the (already global-
  // filtered) responses. matchSet() intersects them, optionally excluding one
  // question so its own chart keeps showing the full distribution.
  const perQuestionSets = useMemo(
    () => buildPerQuestionSets(responses, drill),
    [responses, drill],
  );

  const matchSet = (excludeQid?: string): Set<string> | null =>
    matchingTesterIds(perQuestionSets, excludeQid);

  const applyDrill = (list: Response[], excludeQid?: string): Response[] =>
    applyDrillIds(list, matchSet(excludeQid));

  const drillEntries = Object.entries(drill);
  const drillActive = drillEntries.length > 0;
  const matchedCount = matchSet()?.size ?? null;

  if (!category) {
    return (
      <div className="px-8 py-8">
        <div className="text-slate-400 text-sm">Category not found.</div>
      </div>
    );
  }

  const ratingQuestions = catQuestions.filter((q) => isRatingType(q.type));
  const otherQuestions = catQuestions.filter((q) => !isRatingType(q.type));

  return (
    <div className="mx-auto w-full max-w-6xl px-6 lg:px-8 py-8">
      <div className="mb-6">
        <Link href="/categories" className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors mb-4">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to categories
        </Link>
        <PageHeader
          title={category.name}
          sub={`${catQuestions.length} questions · ${countRespondents(catResponses)} respondents`}
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

      {/* Active drill-down filters — pinned to the top while scrolling so the
          cross-filter context stays visible. Opaque fill + blur keep scrolled
          content from bleeding through the bar. */}
      {drillActive && (
        <div className="sticky top-0 z-20 mb-6 rounded-xl border border-indigo-500/40 bg-indigo-950/85 backdrop-blur-md p-4 shadow-lg shadow-black/30">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-indigo-200">
              <Filter className="w-3.5 h-3.5" />
              Cross-filtering ·{' '}
              <span className="text-white">
                {matchedCount ?? 0} matching {matchedCount === 1 ? 'tester' : 'testers'}
              </span>
            </div>
            <button
              onClick={clearDrill}
              className="text-xs text-indigo-300 hover:text-white transition-colors"
            >
              Clear all
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {drillEntries.map(([qid, val]) => {
              const q = questions.find((x) => x.id === qid);
              return (
                <button
                  key={qid}
                  onClick={() => removeDrill(qid)}
                  title="Remove this filter"
                  className="group flex items-center gap-2 px-3 py-1.5 rounded-full border border-indigo-400/40 bg-slate-900/60 hover:border-indigo-300 transition-colors"
                >
                  <span className="text-xs text-slate-300">
                    {q ? shortenQuestion(q.text) : qid} = <span className="font-semibold text-white">{val}</span>
                  </span>
                  <X className="w-3 h-3 text-slate-500 group-hover:text-white" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Rating questions */}
      {ratingQuestions.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-white mb-4">Ratings</h2>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {ratingQuestions.map((q) => {
              // Own chart shows the full distribution among testers matching the
              // *other* drill filters (exclude self), with the selected bar lit.
              const visible = applyDrill(responses.filter((r) => r.questionId === q.id), q.id);
              const ratingResps = visible.filter((r) => r.numericValue !== null);
              const dist = ratingResps.length > 0
                ? computeRatingDistribution(ratingResps, q.type === 'rating_1_10' ? 10 : 5)
                : null;
              const scored = visible.filter((r) => r.normalizedScore !== null);
              const avgNorm = scored.length
                ? Math.round(scored.reduce((s, r) => s + (r.normalizedScore ?? 0), 0) / scored.length)
                : null;
              const lowScorePct = scored.length
                ? Math.round((scored.filter((r) => (r.normalizedScore ?? 0) < 40).length / scored.length) * 100)
                : null;

              return (
                <div key={q.id} className="rounded-xl border border-slate-700/60 bg-slate-800/20 p-5 flex flex-col">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="flex items-start gap-2 flex-1">
                      <HelpCircle className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm text-white leading-snug">{q.text}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <Badge label={questionTypeLabel(q.type)} variant="type" />
                          <span className="text-xs text-slate-500">{visible.length} responses</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {avgNorm !== null && (
                        <div className="text-right">
                          <div className={`text-xl font-bold ${scoreColor(avgNorm)}`}>{avgNorm}</div>
                          <div className="text-[10px] text-slate-500">/ 100 avg</div>
                        </div>
                      )}
                      <button
                        onClick={() => setSummaryQ(q)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-500/40 bg-indigo-600/20 text-xs text-indigo-300 hover:bg-indigo-600/30 hover:border-indigo-400/60 transition-colors"
                      >
                        <Sparkles className="w-3.5 h-3.5" /> Summarise
                      </button>
                      <Link
                        href={`/questions/${q.id}`}
                        className="px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-300 hover:text-white hover:border-slate-500 transition-colors"
                      >
                        Detail →
                      </Link>
                    </div>
                  </div>

                  {avgNorm !== null && (
                    <div className="mb-4">
                      <ScoreBar score={avgNorm} height="h-2" />
                      {lowScorePct !== null && (
                        <div className="text-[10px] text-slate-500 mt-1">{lowScorePct}% low scores</div>
                      )}
                    </div>
                  )}

                  {dist ? (
                    <div className="mt-auto">
                      <div className="text-[10px] text-slate-500 mb-2 uppercase tracking-wide">
                        Rating distribution (click a bar to cross-filter)
                      </div>
                      <RatingBarChart
                        data={dist}
                        scale={q.type === 'rating_1_10' ? 10 : 5}
                        selectedValue={drill[q.id]}
                        onBarClick={(val) => toggleDrill(q.id, val)} // was: openDrawer(q.id, val)
                      />
                    </div>
                  ) : (
                    <div className="mt-auto text-xs text-slate-500 italic py-4 text-center">
                      No responses match the current selection.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Free-text & other question types */}
      {otherQuestions.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-white mb-4">Open-ended &amp; other</h2>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {otherQuestions.map((q) => {
              const visible = applyDrill(responses.filter((r) => r.questionId === q.id));
              const freeTextResponses = visible.filter((r) => r.numericValue === null && r.rawAnswer);

              // Option frequency for yes/no & multiple-choice questions, derived
              // from the drill-filtered responses so it tracks the cross-filter.
              const isCategorical = q.type === 'yes_no' || q.type === 'multiple_choice';
              const answered = visible.filter((r) => r.rawAnswer.trim());
              const mcDist = isCategorical
                ? (() => {
                    const counts: Record<string, number> = {};
                    for (const r of answered) {
                      const val = r.rawAnswer.trim();
                      counts[val] = (counts[val] ?? 0) + 1;
                    }
                    return Object.entries(counts)
                      .sort((a, b) => b[1] - a[1])
                      .map(([label, count]) => ({
                        label,
                        count,
                        pct: answered.length > 0 ? Math.round((count / answered.length) * 100) : 0,
                      }));
                  })()
                : [];

              return (
                <div key={q.id} className="rounded-xl border border-slate-700/60 bg-slate-800/20 p-5">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="flex items-start gap-2 flex-1">
                      <HelpCircle className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm text-white leading-snug">{q.text}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <Badge label={questionTypeLabel(q.type)} variant="type" />
                          <span className="text-xs text-slate-500">{visible.length} responses</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => setSummaryQ(q)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-500/40 bg-indigo-600/20 text-xs text-indigo-300 hover:bg-indigo-600/30 hover:border-indigo-400/60 transition-colors"
                      >
                        <Sparkles className="w-3.5 h-3.5" /> Summarise
                      </button>
                      <Link
                        href={`/questions/${q.id}`}
                        className="px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-300 hover:text-white hover:border-slate-500 transition-colors"
                      >
                        Detail →
                      </Link>
                    </div>
                  </div>

                  {q.type === 'free_text' && (
                    freeTextResponses.length > 0 ? (
                      <div>
                        <div className="text-[10px] text-slate-500 mb-2 uppercase tracking-wide flex items-center gap-1">
                          <MessageSquare className="w-3 h-3" />
                          {drillActive ? 'Responses from matching testers' : 'Responses'} · {freeTextResponses.length}
                        </div>
                        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                          {freeTextResponses.map((r) => (
                            <div key={r.id} className="text-xs text-slate-300 bg-slate-900/50 border border-slate-700/40 rounded p-3 leading-relaxed italic">
                              &ldquo;{r.rawAnswer}&rdquo;
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500 italic py-2">
                        {drillActive ? 'No responses match the current selection.' : 'No responses yet.'}
                      </div>
                    )
                  )}

                  {/* Safety net: any type that isn't free_text or categorical
                      (e.g. a column mis-detected as timestamp/admin, or an
                      unknown type) still lists its raw answers rather than
                      rendering an empty card. */}
                  {q.type !== 'free_text' && !isCategorical && (
                    answered.length > 0 ? (
                      <div>
                        <div className="text-[10px] text-slate-500 mb-2 uppercase tracking-wide flex items-center gap-1">
                          <MessageSquare className="w-3 h-3" />
                          {drillActive ? 'Responses from matching testers' : 'Responses'} · {answered.length}
                        </div>
                        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                          {answered.map((r) => (
                            <div key={r.id} className="text-xs text-slate-300 bg-slate-900/50 border border-slate-700/40 rounded p-3 leading-relaxed italic">
                              &ldquo;{r.rawAnswer}&rdquo;
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500 italic py-2">
                        {drillActive ? 'No responses match the current selection.' : 'No responses yet.'}
                      </div>
                    )
                  )}

                  {isCategorical && (
                    mcDist.length > 0 ? (
                      <div>
                        <div className="text-[10px] text-slate-500 mb-2 uppercase tracking-wide">
                          {drillActive ? 'Breakdown · matching testers' : 'Response breakdown'}
                        </div>
                        <div className="space-y-2">
                          {mcDist.map(({ label, count, pct }) => (
                            <div key={label} className="flex items-center gap-3">
                              <div className="w-28 text-xs text-slate-300 truncate flex-shrink-0" title={label}>{label}</div>
                              <div className="flex-1 h-4 bg-slate-700/40 rounded-full overflow-hidden">
                                <div className="h-full rounded-full bg-indigo-500/50" style={{ width: `${pct}%` }} />
                              </div>
                              <div className="w-6 text-xs font-semibold text-white text-right flex-shrink-0">{count}</div>
                              <div className="w-9 text-[10px] text-slate-500 text-right flex-shrink-0">{pct}%</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500 italic py-2">
                        {drillActive ? 'No responses match the current selection.' : 'No responses yet.'}
                      </div>
                    )
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {catQuestions.length === 0 && (
        <div className="text-slate-500 text-sm text-center py-8">
          No questions assigned to this category yet.{' '}
          <Link href="/builder" className="text-indigo-400 hover:text-indigo-300">
            Open Category Builder →
          </Link>
        </div>
      )}

      {/* AI summary dialog — summarises the (drill-filtered) responses for the
          chosen question via the same pass as the question-detail AI panel. */}
      {summaryQ && (
        <QuestionSummaryDialog
          question={summaryQ}
          responses={applyDrill(responses.filter((r) => r.questionId === summaryQ.id))}
          testers={testers}
          onClose={() => setSummaryQ(null)}
        />
      )}
    </div>
  );
}
