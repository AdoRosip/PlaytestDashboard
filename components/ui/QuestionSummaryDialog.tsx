'use client';
import { useCallback, useEffect, useState } from 'react';
import { Sparkles, RefreshCw, Lightbulb, X, Brain } from 'lucide-react';
import type { QuestionAnalysisResult } from '@/app/api/question-analysis/route';
import type { Question, Response, Tester } from '@/lib/types';

interface Props {
  question: Question;
  responses: Response[];
  testers: Tester[];
  onClose: () => void;
}

/**
 * Centered modal that runs the same AI pass as the question-detail "Analyse
 * Responses" panel (POST /api/question-analysis) and renders the result in a
 * roomy two-column layout. Self-contained: it fetches on open and is not
 * persisted, so closing/reopening re-runs the analysis.
 */
export default function QuestionSummaryDialog({ question, responses, testers, onClose }: Props) {
  const [analysis, setAnalysis] = useState<QuestionAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    setAnalysis(null);
    try {
      const res = await fetch('/api/question-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, responses, testers }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
      setAnalysis(data as QuestionAnalysisResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setLoading(false);
    }
  }, [question, responses, testers]);

  // Kick off the analysis as soon as the dialog opens. Deferred to a microtask
  // so the initial setState doesn't run synchronously inside the effect body.
  useEffect(() => { queueMicrotask(run); }, [run]);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const answered = responses.filter((r) => r.rawAnswer.trim()).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-3xl max-h-[85vh] flex flex-col rounded-2xl border border-slate-700/60 bg-[#0d1220] shadow-2xl shadow-black/50 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-slate-800 flex-shrink-0">
          <div className="flex items-start gap-2.5 min-w-0">
            <Sparkles className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-white leading-snug">AI Summary</h2>
              <p className="text-xs text-slate-500 mt-0.5 line-clamp-2" title={question.text}>{question.text}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={run}
              disabled={loading}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-indigo-600/20 border border-indigo-500/40 text-indigo-300 hover:bg-indigo-600/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {loading
                ? <><RefreshCw className="w-3 h-3 animate-spin" /> Analysing…</>
                : <><RefreshCw className="w-3 h-3" /> Re-run</>}
            </button>
            <button
              onClick={onClose}
              aria-label="Close"
              className="w-7 h-7 rounded flex items-center justify-center text-slate-500 hover:text-white hover:bg-slate-700 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {loading && (
            <div className="space-y-3 animate-pulse">
              <div className="h-2.5 bg-slate-700/60 rounded w-full" />
              <div className="h-2.5 bg-slate-700/60 rounded w-5/6" />
              <div className="h-2.5 bg-slate-700/60 rounded w-4/5" />
              <div className="h-px bg-slate-800 my-3" />
              <div className="grid grid-cols-2 gap-3">
                <div className="h-16 bg-slate-800/60 rounded-lg" />
                <div className="h-16 bg-slate-800/60 rounded-lg" />
              </div>
            </div>
          )}

          {error && !loading && (
            <div className="rounded-lg bg-red-900/20 border border-red-700/40 px-4 py-3 text-xs text-red-400">
              {error}
            </div>
          )}

          {analysis && !loading && (
            <>
              {/* Summary */}
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Summary</div>
                <p className="text-sm text-slate-300 leading-relaxed">{analysis.summary}</p>
              </div>

              {/* Themes + quotes side by side */}
              {(analysis.themes.length > 0 || analysis.highlights.length > 0) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {analysis.themes.length > 0 && (
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Key Themes</div>
                      <div className="space-y-2">
                        {analysis.themes.map((t, i) => (
                          <div key={i} className="rounded-lg bg-slate-900/50 border border-slate-700/40 px-3 py-2.5">
                            <div className="text-xs font-semibold text-indigo-300 mb-1">{t.label}</div>
                            <div className="text-xs text-slate-400 leading-relaxed">{t.insight}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {analysis.highlights.length > 0 && (
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Notable Quotes</div>
                      <div className="space-y-2">
                        {analysis.highlights.map((q, i) => (
                          <blockquote key={i} className="text-xs text-slate-300 italic border-l-2 border-indigo-500/40 pl-3 leading-relaxed">
                            &ldquo;{q}&rdquo;
                          </blockquote>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Segment insights */}
              {analysis.segmentInsights.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Tester Patterns</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {analysis.segmentInsights.map((s, i) => (
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

              {/* Recommendation */}
              {analysis.actionable && (
                <div className="rounded-lg bg-indigo-900/20 border border-indigo-700/30 px-4 py-3 flex gap-2.5">
                  <Lightbulb className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-indigo-400 mb-1">Recommendation</div>
                    <p className="text-xs text-slate-300 leading-relaxed">{analysis.actionable}</p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-2.5 border-t border-slate-800 flex-shrink-0">
          <p className="text-[10px] text-slate-600">Based on {answered} responses · analysis is not saved</p>
        </div>
      </div>
    </div>
  );
}
