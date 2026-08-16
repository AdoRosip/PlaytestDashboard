'use client';
import { use, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, HelpCircle, MessageSquare, Sparkles } from 'lucide-react';
import { useDashboardStore, selectAnyFilterActive, selectSegmentFilteredResponses } from '@/lib/store';
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
  numericDrillValues,
  answerKey,
} from '@/lib/crossFilter';
import type { Question, Response } from '@/lib/types';
import { filterThemesForResponses } from '@/lib/themeFiltering';

export default function CategoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const categories = useDashboardStore((s) => s.categories);
  const questions   = useDashboardStore((s) => s.questions);
  // Filter-panel-filtered but *not* cross-filtered: every chart on this page is
  // itself a cross-filter control, so each one applies the drill for itself with
  // its own question excluded (see `applyDrill` below). Taking the fully
  // filtered set here would collapse each chart to the bar that was clicked on
  // it, leaving nothing to click next.
  const responses   = useDashboardStore(selectSegmentFilteredResponses);
  const testers     = useDashboardStore((s) => s.testers);
  const storedThemes = useDashboardStore((s) => s.themes);
  const filtersActive = useDashboardStore(selectAnyFilterActive);
  // const openDrawer = useDashboardStore((s) => s.openDrawer); // side panel disabled
  //   on the category page — bar clicks now drive the cross-filter below.

  // ── Cross-question drill-down ──────────────────────────────────────────────
  // Selection lives in the store, so it survives navigation to another category
  // or to a question detail page (feedback items 18 & 19). Pure logic is in
  // `lib/crossFilter.ts`; the chips are rendered globally by `CrossFilterBar`.
  const drill = useDashboardStore((s) => s.drill);
  const toggleDrill = useDashboardStore((s) => s.toggleDrillValue);

  // Question whose AI summary dialog is open (null = closed).
  const [summaryQ, setSummaryQ] = useState<Question | null>(null);

  // Tester-ID set for each drilled question, derived from the segment-filtered
  // responses. matchSet() intersects them, optionally excluding one question so
  // its own chart keeps showing the full distribution. The drill may name
  // questions from other categories — that is the point of item 19 — and those
  // resolve here just the same, because the response list is not scoped to this
  // category.
  const perQuestionSets = useMemo(
    () => buildPerQuestionSets(responses, drill),
    [responses, drill],
  );

  const matchSet = (excludeQid?: string): Set<string> | null =>
    matchingTesterIds(perQuestionSets, excludeQid);

  const applyDrill = (list: Response[], excludeQid?: string): Response[] =>
    applyDrillIds(list, matchSet(excludeQid));

  const drillActive = Object.keys(drill).length > 0;

  // Themes are evidence-linked, so they must be narrowed by the cohort the page
  // actually shows — cross-filter included, or a theme could cite a tester the
  // current selection excludes.
  const cohortResponses = useMemo(
    () => applyDrillIds(responses, matchingTesterIds(perQuestionSets)),
    [responses, perQuestionSets],
  );
  const themes = useMemo(
    () => filterThemesForResponses(storedThemes, cohortResponses, filtersActive),
    [storedThemes, cohortResponses, filtersActive],
  );

  const category = categories.find((c) => c.id === id);
  const catQuestions = questions.filter((q) => q.categoryId === id);
  const catResponses = cohortResponses.filter((r) => catQuestions.some((q) => q.id === r.questionId));
  const catThemes = themes.filter((t) => t.categoryId === id);

  if (!category) {
    return (
      <div className="px-4 md:px-6 lg:px-8 py-8">
        <div className="text-slate-400 text-sm">Category not found.</div>
      </div>
    );
  }

  // Questions that can drive the cross-filter come first: a rating chart or a
  // choice breakdown is a filter control, and everything below — free text
  // especially — is meant to be read *through* whatever is selected up here.
  // Prose can only ever be filtered, never filter, so it always sorts last.
  const isChoiceType = (t: Question['type']) => t === 'yes_no' || t === 'multiple_choice';
  const ratingQuestions = catQuestions.filter((q) => isRatingType(q.type));
  const choiceQuestions = catQuestions.filter((q) => isChoiceType(q.type));
  const otherQuestions = catQuestions.filter(
    (q) => !isRatingType(q.type) && !isChoiceType(q.type),
  );

  return (
    <div className="mx-auto w-full max-w-[1680px] px-4 md:px-6 lg:px-8 py-8">
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

      {/* The active cross-filter chips are rendered once by `DashboardShell`
          (see `components/filters/CrossFilterBar.tsx`), so they stay on screen
          across every page rather than only this one. */}

      {/* Rating questions */}
      {ratingQuestions.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-white mb-1">Ratings</h2>
          <p className="text-xs text-slate-400 mb-4">
            Click a bar to filter every other question down to those testers.
          </p>
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
                        isInverseScored={q.isInverseScored}
                        selectedValues={numericDrillValues(drill[q.id])}
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

      {/* Choice questions before prose: they can drive the cross-filter, and the
          free-text answers below are meant to be read through that selection.
          Both groups render the identical card, so they share one map. */}
      {[
        {
          key: 'choices',
          title: 'Multiple choice & yes/no',
          hint: 'Click an answer to filter every other question down to those testers.',
          list: choiceQuestions,
        },
        {
          key: 'prose',
          title: 'Open-ended & other',
          hint: null as string | null,
          list: otherQuestions,
        },
      ].filter((section) => section.list.length > 0).map((section) => (
        <div key={section.key} className="mb-8">
          <h2 className={`text-sm font-semibold text-white ${section.hint ? 'mb-1' : 'mb-4'}`}>
            {section.title}
          </h2>
          {section.hint && <p className="text-xs text-slate-400 mb-4">{section.hint}</p>}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {section.list.map((q) => {
              const isCategorical = isChoiceType(q.type);
              // A choice question is itself a filter control, so its own breakdown
              // excludes its own selection (exactly as the rating charts do) —
              // otherwise clicking "Yes" would collapse the chart to 100% Yes and
              // leave no "No" bar to switch to. Prose questions filter fully.
              const visible = applyDrill(
                responses.filter((r) => r.questionId === q.id),
                isCategorical ? q.id : undefined,
              );
              const freeTextResponses = visible.filter((r) => r.numericValue === null && r.rawAnswer);

              // Option frequency for yes/no & multiple-choice questions, derived
              // from the drill-filtered responses so it tracks the cross-filter.
              const answered = visible.filter((r) => r.rawAnswer.trim());
              // Verbatim answers are what people came to read, so they take the
              // full grid width. Choice breakdowns are compact bars and stay
              // paired up two to a row.
              const isProse = !isCategorical;
              const mcDist = isCategorical
                ? (() => {
                    const counts: Record<string, number> = {};
                    for (const r of answered) {
                      // Same key the cross-filter matches on, so a clicked bar
                      // always resolves to exactly the testers it counted.
                      const val = answerKey(r.rawAnswer);
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
                <div
                  key={q.id}
                  className={`rounded-xl border border-slate-700/60 bg-slate-800/20 p-5 ${isProse ? 'xl:col-span-2' : ''}`}
                >
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
                        {/* Capped at a readable measure: the card is full width,
                            but ~110 characters is the most a line should carry. */}
                        <div className="space-y-2 max-h-[30rem] overflow-y-auto pr-1">
                          {freeTextResponses.map((r) => (
                            <div key={r.id} className="text-sm text-slate-300 bg-slate-900/50 border border-slate-700/40 rounded p-3 leading-relaxed">
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
                        <div className="space-y-2 max-h-[30rem] overflow-y-auto pr-1">
                          {answered.map((r) => (
                            <div key={r.id} className="text-sm text-slate-300 bg-slate-900/50 border border-slate-700/40 rounded p-3 leading-relaxed">
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
                          {mcDist.map(({ label, count, pct }) => {
                            // Same cross-filter as the rating bars, keyed on the
                            // verbatim answer instead of a rating bucket.
                            const selected = (drill[q.id] ?? []).includes(label);
                            const someSelected = (drill[q.id] ?? []).length > 0;
                            return (
                              <button
                                key={label}
                                onClick={() => toggleDrill(q.id, label)}
                                aria-pressed={selected}
                                title={selected ? `Remove filter: ${label}` : `Filter to testers who answered "${label}"`}
                                className="flex items-center gap-3 w-full text-left rounded px-1 -mx-1 py-0.5 hover:bg-slate-700/30 transition-colors cursor-pointer"
                              >
                                <div className={`w-28 text-xs truncate flex-shrink-0 ${selected ? 'text-white font-semibold' : 'text-slate-300'}`} title={label}>{label}</div>
                                <div className="flex-1 h-4 bg-slate-700/40 rounded-full overflow-hidden">
                                  {/* Stays a single neutral hue: these options are
                                      nominal, so the red→green polarity ramp would
                                      claim "Yes" is good and "No" is bad. Unselected
                                      bars dim once a selection exists, matching how
                                      RatingBarChart marks its choice. */}
                                  <div
                                    className="h-full rounded-full bg-indigo-500/50 transition-opacity"
                                    style={{
                                      width: `${pct}%`,
                                      opacity: !someSelected || selected ? 1 : 0.25,
                                    }}
                                  />
                                </div>
                                <div className="w-6 font-mono text-xs font-semibold text-white text-right flex-shrink-0">{count}</div>
                                <div className="w-9 font-mono text-[10px] text-slate-500 text-right flex-shrink-0">{pct}%</div>
                              </button>
                            );
                          })}
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
      ))}

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
