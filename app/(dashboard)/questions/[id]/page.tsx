'use client';
import { use, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, MessageSquare, User, Clock, Sparkles, RefreshCw, Lightbulb, X, Brain, Filter, CalendarDays } from 'lucide-react';
import type { QuestionAnalysisResult } from '@/app/api/question-analysis/route';
import { useDashboardStore, selectSegmentFilteredResponses } from '@/lib/store';
import PageHeader from '@/components/ui/PageHeader';
import Badge from '@/components/ui/Badge';
import RatingBarChart from '@/components/charts/RatingBarChart';
import SegmentBreakdown from '@/components/charts/SegmentBreakdown';
import CollapsibleSection from '@/components/ui/CollapsibleSection';
import { questionTypeLabel, scoreColor, formatDate, computeRatingDistribution, formatTesterLabel } from '@/lib/utils';
import { applyDrill, buildPerQuestionSets, matchingTesterIds, numericDrillValues } from '@/lib/crossFilter';

// TODO: AI analysis results are local state and are cleared on navigation.
// Future improvement: persist in Zustand store keyed by questionId so results
// survive back-navigation within the same session.

export default function QuestionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const questions       = useDashboardStore((s) => s.questions);
  const categories      = useDashboardStore((s) => s.categories);
  // Filter-panel-filtered only; the cross-filter is applied below so this page
  // can exclude its own question from it (see `otherTesterIds`).
  const responses       = useDashboardStore(selectSegmentFilteredResponses);
  const testers         = useDashboardStore((s) => s.testers);
  const openTesterPanel = useDashboardStore((s) => s.openTesterPanel);
  const router          = useRouter();

  const [aiPanelOpen, setAiPanelOpen] = useState(false);

  // The cross-filter is shared with the category pages via the store, so
  // arriving here through "Detail →" keeps whatever was selected there (item
  // 18), and a selection made here survives navigating away (item 19).
  const drill           = useDashboardStore((s) => s.drill);
  const toggleDrill     = useDashboardStore((s) => s.toggleDrillValue);
  const clearDrillQuestion = useDashboardStore((s) => s.clearDrillQuestion);

  const question      = questions.find((q) => q.id === id);
  const scale         = (question?.type === 'rating_1_10' ? 10 : 5) as 5 | 10;
  const selectedRatings = drill[id];
  const ratingFilterActive = Boolean(selectedRatings?.length);

  const perQuestionSets = useMemo(
    () => buildPerQuestionSets(responses, drill),
    [responses, drill],
  );

  // Constraints from *other* questions — including ones in other categories.
  // These narrow everything on the page, this question's own chart included:
  // "of the testers who rated the core loop 1-2 over there, how did they answer
  // this?" is exactly the question item 19 asks the platform to be able to hold.
  const otherTesterIds = useMemo(
    () => matchingTesterIds(perQuestionSets, id),
    [perQuestionSets, id],
  );
  // …and the full set, this question's own selection included.
  const selectedTesterIds = useMemo(
    () => matchingTesterIds(perQuestionSets),
    [perQuestionSets],
  );

  // Base for the distribution chart: narrowed by the other questions, but not by
  // this one — otherwise clicking "2" would redraw the chart as 100% "2" and
  // leave no other bar to click.
  const allQuestionResponses = useMemo(
    () => applyDrill(responses.filter((r) => r.questionId === id), otherTesterIds),
    [responses, id, otherTesterIds],
  );
  const qResponses = useMemo(
    () => applyDrill(allQuestionResponses, selectedTesterIds),
    [allQuestionResponses, selectedTesterIds],
  );
  const responseSignature = useMemo(
    () => JSON.stringify(qResponses.map((r) => [r.id, r.rawAnswer, r.numericValue, r.normalizedScore])),
    [qResponses],
  );
  const aiRequestId = useRef(0);
  const [storedAiAnalysis, setAiAnalysis] = useState<QuestionAnalysisResult | null>(null);
  const [aiAnalysisSignature, setAiAnalysisSignature] = useState<string | null>(null);
  const [aiLoadingSignature, setAiLoadingSignature] = useState<string | null>(null);
  const [storedAiError, setStoredAiError] = useState<{ signature: string; message: string } | null>(null);
  const aiAnalysis = aiAnalysisSignature === responseSignature ? storedAiAnalysis : null;
  const aiLoading = aiLoadingSignature === responseSignature;
  const aiError = storedAiError?.signature === responseSignature ? storedAiError.message : null;
  const analysisTesters = useMemo(() => {
    const testerIds = new Set(qResponses.flatMap((r) => r.testerId ? [r.testerId] : []));
    return testers.filter((tester) => testerIds.has(tester.id));
  }, [qResponses, testers]);
  const ratingResponses   = qResponses.filter((r) => r.normalizedScore !== null);
  const freeTextResponses = qResponses.filter((r) => r.numericValue === null && r.rawAnswer);

  const ratingDist = useMemo(() => {
    // Recompute from the live response set (the memoised selector hands us a new
    // array identity whenever filters change, so this stays in sync).
    const rr = allQuestionResponses.filter((r) => r.normalizedScore !== null);
    return rr.length > 0 ? computeRatingDistribution(rr, scale) : null;
  }, [allQuestionResponses, scale]);

  const toggleRatingFilter = (value: number) => {
    toggleDrill(id, value);
    // An existing analysis describes a different response set after the filter changes.
    setAiAnalysis(null);
    setStoredAiError(null);
  };

  // Clears only this question's selection. Constraints carried in from another
  // category stay — they are removed from their own chip in the global bar.
  const clearRatingFilter = () => {
    clearDrillQuestion(id);
    setAiAnalysis(null);
    setStoredAiError(null);
  };

  const playtimeMap = useMemo(() => {
    const playtimeQ = questions.find((q) =>
      /how many hours.*(?:play|game|session)|hours.*played.*(?:exo|game|session)|session.*(?:duration|length)/i.test(q.text)
      && q.id !== id
    );
    const map = new Map<string, string>();
    if (playtimeQ) {
      for (const r of responses) {
        if (r.questionId === playtimeQ.id && r.testerId && r.rawAnswer) {
          map.set(r.testerId, r.rawAnswer);
        }
      }
    }
    return map;
  }, [questions, responses, id]);

  const runAiAnalysis = async () => {
    if (!question) return;
    const requestId = ++aiRequestId.current;
    const requestedSignature = responseSignature;
    setAiLoadingSignature(requestedSignature);
    setStoredAiError(null);
    try {
      const res = await fetch('/api/question-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, responses: qResponses, testers: analysisTesters }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
      if (requestId !== aiRequestId.current) return;
      setAiAnalysis(data as QuestionAnalysisResult);
      setAiAnalysisSignature(requestedSignature);
    } catch (err) {
      if (requestId !== aiRequestId.current) return;
      setStoredAiError({
        signature: requestedSignature,
        message: err instanceof Error ? err.message : 'Analysis failed',
      });
    } finally {
      if (requestId === aiRequestId.current) setAiLoadingSignature(null);
    }
  };

  if (!question) {
    return <div className="px-8 py-8 text-slate-400 text-sm">Question not found.</div>;
  }

  const cat = categories.find((c) => c.id === question.categoryId);

  const isRating = question.type === 'rating_1_5' || question.type === 'rating_1_10';

  const avg = ratingResponses.length
    ? (ratingResponses.reduce((s, r) => s + (r.numericValue ?? 0), 0) / ratingResponses.length).toFixed(2)
    : null;

  const lowCount  = ratingResponses.filter((r) => (r.normalizedScore ?? 100) < 40).length;
  const highCount = ratingResponses.filter((r) => (r.normalizedScore ?? 0) >= 65).length;
  const midCount  = ratingResponses.length - lowCount - highCount;

  // Option frequency for multiple choice / yes-no questions
  const mcDist = (question.type === 'multiple_choice' || question.type === 'yes_no')
    ? (() => {
        const counts: Record<string, number> = {};
        for (const r of qResponses) {
          const val = r.rawAnswer.trim();
          if (val) counts[val] = (counts[val] ?? 0) + 1;
        }
        const total = qResponses.length;
        return Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .map(([label, count]) => ({ label, count, pct: total > 0 ? Math.round((count / total) * 100) : 0 }));
      })()
    : [];

  return (
    <div className="mx-auto w-full max-w-[1680px] flex flex-col xl:flex-row items-stretch xl:items-start gap-6 py-8 px-4 md:px-6 lg:px-8">

      {/* ── Main content ─────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0">
        <button onClick={() => router.back()} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors mb-4">
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>

        <PageHeader
          title={question.text}
          sub={`${questionTypeLabel(question.type)} · ${qResponses.length}${ratingFilterActive ? ` of ${allQuestionResponses.length}` : ''} responses`}
          actions={
            <div className="flex items-center gap-2">
              {cat && <Badge label={cat.name} variant="accent" />}
              <button
                onClick={() => setAiPanelOpen((o) => !o)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  aiPanelOpen
                    ? 'bg-indigo-600/30 border-indigo-400/60 text-indigo-200'
                    : 'bg-indigo-600/20 border-indigo-500/40 text-indigo-300 hover:bg-indigo-600/30 hover:border-indigo-400/60'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Analyse Responses
              </button>
            </div>
          }
        />

        {ratingFilterActive && (
          <div className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-indigo-500/40 bg-indigo-950/60 px-4 py-3">
            <div className="flex items-center gap-2 text-xs text-indigo-200">
              <Filter className="w-3.5 h-3.5" />
              Showing testers who scored
              <span className="flex items-center gap-1">
                {selectedRatings?.map((value, index) => (
                  <span key={value} className="flex items-center gap-1">
                    {index > 0 && <span className="text-indigo-300/60">or</span>}
                    <span className="rounded-md bg-slate-950/60 px-2 py-0.5 font-semibold text-white">{value}</span>
                  </span>
                ))}
              </span>
              <span className="text-indigo-300/70">
                {selectedTesterIds?.size ?? 0} matching {selectedTesterIds?.size === 1 ? 'tester' : 'testers'}
              </span>
            </div>
            <button
              onClick={clearRatingFilter}
              className="text-xs font-medium text-indigo-300 transition-colors hover:text-white"
            >
              Clear
            </button>
          </div>
        )}

        {/* Stats row — rating questions only */}
        {isRating && (
          <CollapsibleSection
            title="Score Summary"
            description="Average and score distribution for the visible responses"
            className="mb-6"
          >
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {avg && (
                <div className="rounded-xl border border-slate-700/60 bg-slate-800/20 p-4 text-center">
                  <div className={`text-2xl font-bold ${scoreColor(
                    question.type === 'rating_1_5' ? ((parseFloat(avg) - 1) / 4) * 100 : parseFloat(avg) * 10
                  )}`}>{avg}</div>
                  <div className="text-xs text-slate-500 mt-1">Average</div>
                </div>
              )}
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-center">
                <div className="text-2xl font-bold text-red-400">{lowCount}</div>
                <div className="text-xs text-slate-500 mt-1">Low scores</div>
              </div>
              <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4 text-center">
                <div className="text-2xl font-bold text-yellow-400">{midCount}</div>
                <div className="text-xs text-slate-500 mt-1">Neutral</div>
              </div>
              <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4 text-center">
                <div className="text-2xl font-bold text-green-400">{highCount}</div>
                <div className="text-xs text-slate-500 mt-1">High scores</div>
              </div>
            </div>
          </CollapsibleSection>
        )}

        {/* Rating distribution chart */}
        {ratingDist && (
          <CollapsibleSection
            title="Rating Distribution"
            description={ratingFilterActive
              ? `Filtering this page to scores ${selectedRatings?.join(' or ')}. Click a selected bar to remove it, or another bar to add it.`
              : 'Click one or more bars to include testers behind those ratings.'}
            className="mb-6"
          >
            <RatingBarChart
              data={ratingDist}
              scale={scale}
              isInverseScored={question.isInverseScored}
              selectedValues={numericDrillValues(selectedRatings)}
              onBarClick={toggleRatingFilter}
            />
          </CollapsibleSection>
        )}

        {/* Segment breakdown */}
        {ratingResponses.length > 0 && (
          <SegmentBreakdown
            responses={ratingResponses}
            testers={testers}
            scale={scale}
            isInverseScored={question.isInverseScored}
          />
        )}

        {/* Multiple choice / Yes-No distribution */}
        {mcDist.length > 0 && (
          <CollapsibleSection
            title="Response Breakdown"
            description="Distribution of answers across the visible responses"
            className="mb-6"
          >
            <div className="space-y-2.5">
              {mcDist.map(({ label, count, pct }) => (
                <div key={label} className="flex items-center gap-3">
                  <div className="w-40 text-xs text-slate-300 truncate flex-shrink-0" title={label}>{label}</div>
                  <div className="flex-1 h-4 bg-slate-700/40 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-indigo-500/50" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="w-6 text-xs font-semibold text-white text-right flex-shrink-0">{count}</div>
                  <div className="w-9 text-[10px] text-slate-500 text-right flex-shrink-0">{pct}%</div>
                </div>
              ))}
            </div>
          </CollapsibleSection>
        )}

        {/* Multiple choice / Yes-No individual responses */}
        {(question.type === 'multiple_choice' || question.type === 'yes_no') && qResponses.length > 0 && (
          <CollapsibleSection
            title="Individual Responses"
            description="Answers and tester context"
            meta={(
              <span className="rounded-full border border-slate-700 bg-slate-900/50 px-2.5 py-1 text-[11px] text-slate-400">
                {qResponses.length}
              </span>
            )}
            className="mb-6"
          >
            <div className="space-y-1.5 overflow-y-auto max-h-[480px] pr-2 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-700">
              {qResponses.slice(0, 30).map((r) => {
                const tester = testers.find((t) => t.id === r.testerId);
                const playtime = r.testerId ? playtimeMap.get(r.testerId) : undefined;
                return (
                  <div key={r.id} className="flex items-center gap-3 rounded-lg border border-slate-700/40 bg-slate-900/30 px-4 py-2.5">
                    <span className="flex-1 text-xs text-slate-300 min-w-0 truncate" title={r.rawAnswer}>{r.rawAnswer}</span>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="text-xs text-slate-500">{tester ? formatTesterLabel(tester) : 'Unknown tester'}</span>
                      {tester?.ageGroup && (
                        <span className="text-[10px] bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded">{tester.ageGroup}</span>
                      )}
                      {playtime && (
                        <span className="text-[10px] bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" />{playtime}h
                        </span>
                      )}
                      {tester && (
                        <button
                          onClick={() => openTesterPanel(tester.id)}
                          className="text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors border border-indigo-400/30 hover:border-indigo-300/50 rounded px-2 py-0.5"
                        >
                          Profile →
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {qResponses.length > 30 && (
                <p className="text-xs text-slate-500 text-center py-2">+{qResponses.length - 30} more responses</p>
              )}
            </div>
          </CollapsibleSection>
        )}

        {/* Free text responses */}
        {question.type === 'free_text' && (
          <CollapsibleSection
            title="All Responses"
            description="Written feedback and tester context"
            meta={(
              <span className="flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900/50 px-2.5 py-1 text-[11px] text-slate-400">
                <MessageSquare className="h-3 w-3 text-indigo-400" />
                {freeTextResponses.length}
              </span>
            )}
          >
            <div className="space-y-3 overflow-y-auto max-h-[480px] pr-2 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-700">
              {freeTextResponses.map((r) => {
                const tester = testers.find((t) => t.id === r.testerId);
                const playtime = r.testerId ? playtimeMap.get(r.testerId) : undefined;
                return (
                  <div key={r.id} className="rounded-lg border border-slate-700/50 bg-slate-900/40 p-4">
                    <p className="text-sm text-slate-200 leading-relaxed italic mb-3">
                      &ldquo;{r.rawAnswer}&rdquo;
                    </p>
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <User className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                        <span className="text-xs text-slate-400">{tester ? formatTesterLabel(tester) : 'Unknown tester'}</span>
                        {tester?.ageGroup && (
                          <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full">{tester.ageGroup}</span>
                        )}
                        {tester?.segments.hardware_tier && (
                          <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full">{tester.segments.hardware_tier} hw</span>
                        )}
                        {playtime && (
                          <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" />{playtime}h played
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-600">{formatDate(r.submittedAt)}</span>
                        {tester && (
                          <button
                            onClick={() => openTesterPanel(tester.id)}
                            className="text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors border border-indigo-400/30 hover:border-indigo-300/50 rounded px-2 py-0.5"
                          >
                            Profile →
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CollapsibleSection>
        )}

        {/* Rating responses list */}
        {question.type !== 'free_text' && ratingResponses.length > 0 && (
          <CollapsibleSection
            title="Individual Responses"
            description="Click bars in the chart above to filter by one or more scores."
            meta={(
              <span className="rounded-full border border-slate-700 bg-slate-900/50 px-2.5 py-1 text-[11px] text-slate-400">
                {ratingResponses.length} {ratingResponses.length === 1 ? 'response' : 'responses'}
              </span>
            )}
          >
            <div className="max-h-[520px] overflow-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-700">
              <table className="w-full min-w-[760px] border-separate border-spacing-y-2 text-left">
                <thead className="sticky top-0 z-10 bg-[#111726]">
                  <tr className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    <th scope="col" className="w-24 px-4 pb-1">Score</th>
                    <th scope="col" className="px-4 pb-1">Tester</th>
                    <th scope="col" className="w-[300px] px-4 pb-1">Tester profile</th>
                    <th scope="col" className="w-36 px-4 pb-1">Submitted</th>
                    <th scope="col" className="w-24 px-4 pb-1 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {ratingResponses.map((r) => {
                    const tester = testers.find((t) => t.id === r.testerId);
                    const playtime = r.testerId ? playtimeMap.get(r.testerId) : undefined;
                    const testerLabel = tester ? formatTesterLabel(tester) : 'Unknown tester';
                    const testerReference = tester?.inRegistry === true
                      ? 'Registry tester'
                      : tester?.inRegistry === false
                        ? 'Response-only tester'
                        : null;
                    const hasProfileDetails = Boolean(tester?.ageGroup || tester?.segments.hardware_tier || playtime);
                    const cellClass = 'border-y border-slate-700/50 bg-slate-900/40 px-4 py-3';

                    return (
                      <tr key={r.id} className="group">
                        <td className={`${cellClass} rounded-l-lg border-l`}>
                          <div
                            className="inline-flex min-w-14 items-baseline justify-center gap-1 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1.5"
                            aria-label={`Score ${r.numericValue} out of ${scale}`}
                          >
                            <span className="text-lg font-bold leading-none text-white">{r.numericValue}</span>
                            <span className="text-[10px] text-indigo-300/70">/ {scale}</span>
                          </div>
                        </td>
                        <td className={cellClass}>
                          <div className="flex min-w-0 items-center gap-2.5">
                            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-800">
                              <User className="h-3.5 w-3.5 text-slate-400" />
                            </div>
                            <div className="min-w-0">
                              <div className="truncate text-xs font-medium text-slate-200" title={testerLabel}>{testerLabel}</div>
                              {testerReference && <div className="mt-0.5 text-[10px] text-slate-500">{testerReference}</div>}
                            </div>
                          </div>
                        </td>
                        <td className={cellClass}>
                          {hasProfileDetails ? (
                            <div className="flex flex-wrap items-center gap-1.5">
                              {tester?.ageGroup && (
                                <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">Age {tester.ageGroup}</span>
                              )}
                              {tester?.segments.hardware_tier && (
                                <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">{tester.segments.hardware_tier} hardware</span>
                              )}
                              {playtime && (
                                <span className="flex items-center gap-1 rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">
                                  <Clock className="h-2.5 w-2.5" />{playtime} played
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-600">No profile data</span>
                          )}
                        </td>
                        <td className={cellClass}>
                          <div className="flex items-center gap-2 whitespace-nowrap text-xs text-slate-400">
                            <CalendarDays className="h-3.5 w-3.5 text-slate-600" />
                            <time dateTime={r.submittedAt}>{formatDate(r.submittedAt)}</time>
                          </div>
                        </td>
                        <td className={`${cellClass} rounded-r-lg border-r text-right`}>
                          {tester ? (
                            <button
                              onClick={() => openTesterPanel(tester.id)}
                              className="rounded-md border border-indigo-400/30 px-2.5 py-1 text-xs font-medium text-indigo-400 transition-colors hover:border-indigo-300/50 hover:text-indigo-300"
                            >
                              Profile →
                            </button>
                          ) : (
                            <span className="text-xs text-slate-600">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CollapsibleSection>
        )}
      </div>

      {/* ── AI Insights panel (side-by-side) ─────────────────────────── */}
      {aiPanelOpen && (
        <div className="w-full xl:w-[400px] xl:flex-shrink-0 xl:sticky xl:top-8 max-h-[80vh] xl:max-h-[calc(100vh-5rem)] flex flex-col rounded-xl border border-slate-700/60 bg-[#0d1220] overflow-hidden">
          {/* Panel header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 flex-shrink-0">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <h2 className="text-sm font-semibold text-white">AI Insights</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setAiAnalysis(null); runAiAnalysis(); }}
                disabled={aiLoading}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-indigo-600/20 border border-indigo-500/40 text-indigo-300 hover:bg-indigo-600/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {aiLoading
                  ? <><RefreshCw className="w-3 h-3 animate-spin" /> Analysing…</>
                  : aiAnalysis
                  ? <><RefreshCw className="w-3 h-3" /> Re-run</>
                  : <><Sparkles className="w-3 h-3" /> Analyse</>
                }
              </button>
              <button
                onClick={() => setAiPanelOpen(false)}
                className="w-6 h-6 rounded flex items-center justify-center text-slate-500 hover:text-white hover:bg-slate-700 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Panel body — scrollable */}
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

            {/* Empty / prompt */}
            {!aiAnalysis && !aiLoading && !aiError && (
              <div className="flex flex-col items-center justify-center text-center gap-4 py-12">
                <div className="w-10 h-10 rounded-full bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-indigo-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-300 mb-1">Analyse with AI</p>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Summary, themes, notable quotes, and demographic patterns from {qResponses.length} responses.
                  </p>
                  <p className="text-[10px] text-slate-600 leading-relaxed mt-2">
                    Running analysis sends these visible responses and matching tester profiles to the configured AI provider.
                  </p>
                </div>
                <button
                  onClick={runAiAnalysis}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" /> Run Analysis
                </button>
              </div>
            )}

            {/* Loading skeleton */}
            {aiLoading && (
              <div className="space-y-3 animate-pulse">
                <div className="h-2.5 bg-slate-700/60 rounded w-full" />
                <div className="h-2.5 bg-slate-700/60 rounded w-5/6" />
                <div className="h-2.5 bg-slate-700/60 rounded w-4/5" />
                <div className="h-px bg-slate-800 my-3" />
                <div className="h-2.5 bg-slate-700/60 rounded w-1/3 mb-2" />
                <div className="h-10 bg-slate-800/60 rounded-lg" />
                <div className="h-10 bg-slate-800/60 rounded-lg" />
                <div className="h-px bg-slate-800 my-3" />
                <div className="h-2.5 bg-slate-700/60 rounded w-1/4 mb-2" />
                <div className="h-8 bg-slate-800/60 rounded-lg" />
                <div className="h-8 bg-slate-800/60 rounded-lg" />
              </div>
            )}

            {/* Error */}
            {aiError && !aiLoading && (
              <div className="rounded-lg bg-red-900/20 border border-red-700/40 px-4 py-3 text-xs text-red-400">
                {aiError}
              </div>
            )}

            {/* Results */}
            {aiAnalysis && !aiLoading && (
              <>
                {/* Summary */}
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Summary</div>
                  <p className="text-sm text-slate-300 leading-relaxed">{aiAnalysis.summary}</p>
                </div>

                {/* Themes */}
                {aiAnalysis.themes.length > 0 && (
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Key Themes</div>
                    <div className="space-y-2">
                      {aiAnalysis.themes.map((t, i) => (
                        <div key={i} className="rounded-lg bg-slate-900/50 border border-slate-700/40 px-3 py-2.5">
                          <div className="text-xs font-semibold text-indigo-300 mb-1">{t.label}</div>
                          <div className="text-xs text-slate-400 leading-relaxed">{t.insight}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Segment insights */}
                {aiAnalysis.segmentInsights.length > 0 && (
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Tester Patterns</div>
                    <div className="space-y-2">
                      {aiAnalysis.segmentInsights.map((s, i) => (
                        <div key={i} className="rounded-lg bg-violet-900/10 border border-violet-700/30 px-3 py-2.5 flex gap-2.5">
                          <Brain className="w-3.5 h-3.5 text-violet-400 flex-shrink-0 mt-0.5" />
                          <div>
                            <div className="text-[10px] font-semibold text-violet-300 mb-0.5">{s.segment}</div>
                            <div className="text-xs text-slate-400 leading-relaxed">{s.finding}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Highlights */}
                {aiAnalysis.highlights.length > 0 && (
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Notable Quotes</div>
                    <div className="space-y-2">
                      {aiAnalysis.highlights.map((q, i) => (
                        <blockquote key={i} className="text-xs text-slate-300 italic border-l-2 border-indigo-500/40 pl-3 leading-relaxed">
                          &ldquo;{q}&rdquo;
                        </blockquote>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actionable */}
                {aiAnalysis.actionable && (
                  <div className="rounded-lg bg-indigo-900/20 border border-indigo-700/30 px-3 py-3 flex gap-2.5">
                    <Lightbulb className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-indigo-400 mb-1">Recommendation</div>
                      <p className="text-xs text-slate-300 leading-relaxed">{aiAnalysis.actionable}</p>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Persistence notice */}
          {aiAnalysis && (
            <div className="px-5 py-2.5 border-t border-slate-800 flex-shrink-0">
              <p className="text-[10px] text-slate-600 text-center">Analysis is not saved — re-run after navigating away</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
