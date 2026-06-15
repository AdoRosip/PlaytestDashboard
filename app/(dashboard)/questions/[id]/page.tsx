'use client';
import { use, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, MessageSquare, User, Clock, Sparkles, RefreshCw, Lightbulb, X, Brain } from 'lucide-react';
import type { QuestionAnalysisResult } from '@/app/api/question-analysis/route';
import { useDashboardStore, selectFilteredResponses } from '@/lib/store';
import PageHeader from '@/components/ui/PageHeader';
import Badge from '@/components/ui/Badge';
import RatingBarChart from '@/components/charts/RatingBarChart';
import SegmentBreakdown from '@/components/charts/SegmentBreakdown';
import { questionTypeLabel, scoreColor, formatDate, computeRatingDistribution, formatTesterId } from '@/lib/utils';

// TODO: AI analysis results are local state and are cleared on navigation.
// Future improvement: persist in Zustand store keyed by questionId so results
// survive back-navigation within the same session.

export default function QuestionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const questions       = useDashboardStore((s) => s.questions);
  const categories      = useDashboardStore((s) => s.categories);
  const responses       = useDashboardStore(selectFilteredResponses);
  const testers         = useDashboardStore((s) => s.testers);
  const openDrawer      = useDashboardStore((s) => s.openDrawer);
  const openTesterPanel = useDashboardStore((s) => s.openTesterPanel);
  const router          = useRouter();

  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiAnalysis,  setAiAnalysis]  = useState<QuestionAnalysisResult | null>(null);
  const [aiLoading,   setAiLoading]   = useState(false);
  const [aiError,     setAiError]     = useState<string | null>(null);

  const question      = questions.find((q) => q.id === id);
  const qResponses    = responses.filter((r) => r.questionId === id);
  const scale         = (question?.type === 'rating_1_10' ? 10 : 5) as 5 | 10;
  const ratingResponses   = qResponses.filter((r) => r.normalizedScore !== null);
  const freeTextResponses = qResponses.filter((r) => r.numericValue === null && r.rawAnswer);

  const ratingDist = useMemo(() => {
    // Recompute from the live response set (the memoised selector hands us a new
    // array identity whenever filters change, so this stays in sync).
    const rr = responses.filter((r) => r.questionId === id && r.normalizedScore !== null);
    return rr.length > 0 ? computeRatingDistribution(rr, scale) : null;
  }, [responses, id, scale]);

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
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch('/api/question-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, responses: qResponses, testers }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
      setAiAnalysis(data as QuestionAnalysisResult);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setAiLoading(false);
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
    <div className="mx-auto w-full max-w-[1680px] flex items-start gap-6 py-8 px-6 lg:px-8">

      {/* ── Main content ─────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0">
        <button onClick={() => router.back()} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors mb-4">
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>

        <PageHeader
          title={question.text}
          sub={`${questionTypeLabel(question.type)} · ${qResponses.length} responses`}
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

        {/* Stats row — rating questions only */}
        {isRating && <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
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
        </div>}

        {/* Rating distribution chart */}
        {ratingDist && (
          <div className="rounded-xl border border-slate-700/60 bg-slate-800/20 p-5 mb-6">
            <div className="text-sm font-semibold text-white mb-1">Rating Distribution</div>
            <p className="text-xs text-slate-400 mb-4">Click any bar to see the responses behind that rating</p>
            <RatingBarChart
              data={ratingDist}
              scale={scale}
              onBarClick={(val) => openDrawer(id, val)}
            />
          </div>
        )}

        {/* Segment breakdown */}
        {ratingResponses.length > 0 && (
          <SegmentBreakdown
            responses={ratingResponses}
            testers={testers}
            scale={scale}
          />
        )}

        {/* Multiple choice / Yes-No distribution */}
        {mcDist.length > 0 && (
          <div className="rounded-xl border border-slate-700/60 bg-slate-800/20 p-5 mb-6">
            <div className="text-sm font-semibold text-white mb-4">Response Breakdown</div>
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
          </div>
        )}

        {/* Multiple choice / Yes-No individual responses */}
        {(question.type === 'multiple_choice' || question.type === 'yes_no') && qResponses.length > 0 && (
          <div className="rounded-xl border border-slate-700/60 bg-slate-800/20 p-5 mb-6">
            <h2 className="text-sm font-semibold text-white mb-3">
              Individual Responses
              <span className="text-xs font-normal text-slate-500 ml-2">({qResponses.length})</span>
            </h2>
            <div className="space-y-1.5 overflow-y-auto max-h-[480px] pr-2 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-700">
              {qResponses.slice(0, 30).map((r) => {
                const tester = testers.find((t) => t.id === r.testerId);
                const playtime = r.testerId ? playtimeMap.get(r.testerId) : undefined;
                return (
                  <div key={r.id} className="flex items-center gap-3 rounded-lg border border-slate-700/40 bg-slate-900/30 px-4 py-2.5">
                    <span className="flex-1 text-xs text-slate-300 min-w-0 truncate" title={r.rawAnswer}>{r.rawAnswer}</span>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="text-xs text-slate-500">{tester ? formatTesterId(tester.testerId) : 'Unknown'}</span>
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
          </div>
        )}

        {/* Free text responses */}
        {question.type === 'free_text' && (
          <div className="rounded-xl border border-slate-700/60 bg-slate-800/20 p-5">
            <div className="flex items-center gap-2 mb-4">
              <MessageSquare className="w-4 h-4 text-indigo-400" />
              <h2 className="text-sm font-semibold text-white">All Responses</h2>
              <span className="text-xs text-slate-500">({freeTextResponses.length})</span>
            </div>
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
                        <span className="text-xs text-slate-400">{tester ? formatTesterId(tester.testerId) : 'Unknown'}</span>
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
          </div>
        )}

        {/* Rating responses list */}
        {question.type !== 'free_text' && ratingResponses.length > 0 && (
          <div className="rounded-xl border border-slate-700/60 bg-slate-800/20 p-5">
            <h2 className="text-sm font-semibold text-white mb-4">Individual Responses</h2>
            <p className="text-xs text-slate-500 mb-3">Click a bar in the chart above to filter by specific score</p>
            <div className="space-y-2 overflow-y-auto max-h-[480px] pr-2 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-700">
              {ratingResponses.slice(0, 15).map((r) => {
                const tester = testers.find((t) => t.id === r.testerId);
                const playtime = r.testerId ? playtimeMap.get(r.testerId) : undefined;
                return (
                  <div key={r.id} className="flex items-center gap-3 rounded-lg border border-slate-700/40 bg-slate-900/30 px-4 py-2.5">
                    <span className="text-lg font-bold text-white w-6 flex-shrink-0">{r.numericValue}</span>
                    <div className="flex-1 flex items-center gap-1.5 flex-wrap min-w-0">
                      <span className="text-xs text-slate-400">{tester ? formatTesterId(tester.testerId) : 'Unknown'}</span>
                      {tester?.ageGroup && (
                        <span className="text-[10px] bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded">{tester.ageGroup}</span>
                      )}
                      {tester?.segments.hardware_tier && (
                        <span className="text-[10px] bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded">{tester.segments.hardware_tier} hw</span>
                      )}
                      {playtime && (
                        <span className="text-[10px] bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" />{playtime}h
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
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
                );
              })}
              {ratingResponses.length > 15 && (
                <button
                  onClick={() => openDrawer(id)}
                  className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors w-full text-center py-2"
                >
                  View all {ratingResponses.length} responses in drawer →
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── AI Insights panel (side-by-side) ─────────────────────────── */}
      {aiPanelOpen && (
        <div className="w-[400px] flex-shrink-0 sticky top-8 max-h-[calc(100vh-5rem)] flex flex-col rounded-xl border border-slate-700/60 bg-[#0d1220] overflow-hidden">
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
