'use client';
import { useState } from 'react';
import {
  Sparkles, ChevronDown, ChevronUp, ExternalLink, Info,
  AlertCircle, RefreshCw, Loader2,
} from 'lucide-react';
import { useDashboardStore } from '@/lib/store';
import PageHeader from '@/components/ui/PageHeader';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import type { Severity } from '@/lib/types';

const severityOrder: Record<Severity, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };

export default function ThemesPage() {
  const themes          = useDashboardStore((s) => s.themes);
  const categories      = useDashboardStore((s) => s.categories);
  const questions       = useDashboardStore((s) => s.questions);
  const responses       = useDashboardStore((s) => s.responses);
  const isLoaded        = useDashboardStore((s) => s.isLoaded);
  const analysisStatus  = useDashboardStore((s) => s.analysisStatus);
  const analysisError   = useDashboardStore((s) => s.analysisError);
  const runThemeAnalysis = useDashboardStore((s) => s.runThemeAnalysis);
  const clearThemes     = useDashboardStore((s) => s.clearThemes);
  const openDrawer      = useDashboardStore((s) => s.openDrawer);

  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter]     = useState<Severity | 'All'>('All');

  const freeTextCount = responses.filter(
    (r) => questions.find((q) => q.id === r.questionId)?.type === 'free_text' && r.rawAnswer?.trim(),
  ).length;

  const sorted = [...themes].sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity] || b.frequency - a.frequency,
  );
  const visible = filter === 'All' ? sorted : sorted.filter((t) => t.severity === filter);

  // No data loaded yet
  if (!isLoaded) {
    return (
      <div className="px-8 py-8">
        <PageHeader title="Themes" sub="AI-detected patterns in open-text responses" />
        <EmptyState
          icon={Sparkles}
          title="No data loaded"
          description="Upload an Excel file first to enable theme analysis."
        />
      </div>
    );
  }

  const isRunning = analysisStatus === 'running';
  const hasThemes = themes.length > 0;

  return (
    <div className="mx-auto w-full max-w-4xl px-6 lg:px-8 py-8">
      <PageHeader
        title="Themes"
        sub={
          hasThemes
            ? `${themes.length} themes · ${freeTextCount} free-text responses analysed`
            : 'AI-detected patterns in open-text responses'
        }
        actions={
          <div className="flex items-center gap-2">
            {hasThemes && !isRunning && (
              <button
                onClick={clearThemes}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-400 hover:text-white hover:border-slate-500 transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                Clear
              </button>
            )}
            {(hasThemes || analysisStatus === 'error') && !isRunning && (
              <button
                onClick={runThemeAnalysis}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-500/40 bg-indigo-600/20 text-xs text-indigo-300 hover:bg-indigo-600/30 transition-colors"
              >
                <Sparkles className="w-3 h-3" />
                Re-run Analysis
              </button>
            )}
          </div>
        }
      />

      {/* Running banner */}
      {isRunning && (
        <div className="flex items-center gap-3 rounded-xl border border-indigo-500/20 bg-indigo-950/30 px-4 py-3 mb-6">
          <Loader2 className="w-4 h-4 text-indigo-400 animate-spin flex-shrink-0" />
          <div className="text-xs text-slate-300">
            Analysing {freeTextCount} free-text responses with ChatGPT
            {themes.length > 0 && (
              <> · <span className="text-indigo-300 font-medium">{themes.length} theme{themes.length !== 1 ? 's' : ''} found so far</span></>
            )}
          </div>
        </div>
      )}

      {/* Error banner */}
      {analysisStatus === 'error' && analysisError && (
        <div className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-950/20 px-4 py-3 mb-6">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-red-300 mb-0.5">Analysis failed</div>
            <div className="text-xs text-slate-400 break-words">{analysisError}</div>
            {analysisError.includes('OPENAI_API_KEY') && (
              <div className="text-xs text-slate-500 mt-1">
                Add <code className="text-slate-300 bg-slate-800 px-1 rounded">OPENAI_API_KEY=sk-...</code> to <code className="text-slate-300 bg-slate-800 px-1 rounded">.env.local</code> in the dashboard folder, then restart the dev server.
              </div>
            )}
          </div>
        </div>
      )}

      {/* No themes yet — show CTA */}
      {!hasThemes && !isRunning && analysisStatus !== 'error' && (
        <div className="rounded-xl border border-indigo-500/20 bg-indigo-950/20 p-10 text-center">
          <Sparkles className="w-8 h-8 text-indigo-400 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-white mb-1">Ready to analyse</h3>
          <p className="text-xs text-slate-400 mb-1 max-w-sm mx-auto">
            Claude will read all {freeTextCount} free-text responses and identify recurring themes, issues, and patterns across your playtest data.
          </p>
          <p className="text-[11px] text-slate-600 mb-6">
            Requires <code className="text-slate-500">OPENAI_API_KEY</code> in <code className="text-slate-500">.env.local</code>
          </p>
          <button
            onClick={runThemeAnalysis}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium text-white transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            Run Analysis
          </button>
        </div>
      )}

      {/* Theme list */}
      {hasThemes && (
        <>
          {/* Disclaimer + filter */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              {(['All', 'Critical', 'High', 'Medium', 'Low'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                    filter === f
                      ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-300'
                      : 'border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500'
                  }`}
                >
                  {f}
                </button>
              ))}
              <span className="text-xs text-slate-500 ml-1">{visible.length} themes</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-800/60 border border-slate-700/60 rounded-lg px-3 py-1.5">
              <Info className="w-3 h-3" />
              AI summaries are indicative — verify with source responses
            </div>
          </div>

          <div className="space-y-3">
            {visible.map((theme) => {
              const cat  = categories.find((c) => c.id === theme.categoryId);
              const isOpen = expanded === theme.id;

              return (
                <div
                  key={theme.id}
                  className="rounded-xl border border-slate-700/60 bg-slate-800/20 overflow-hidden"
                >
                  {/* Header row */}
                  <div
                    className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-slate-800/40 transition-colors"
                    onClick={() => setExpanded(isOpen ? null : theme.id)}
                  >
                    <Badge label={theme.severity} severity={theme.severity} variant="severity" />

                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white">{theme.label}</div>
                      <div className="flex items-center gap-3 mt-0.5">
                        {cat && <span className="text-xs text-slate-500">{cat.name}</span>}
                        <span className="text-xs text-slate-600">{theme.frequency} responses</span>
                        <span className="text-xs text-slate-600">
                          {Math.round(theme.confidence * 100)}% confidence
                        </span>
                      </div>
                    </div>

                    {isOpen ? (
                      <ChevronUp className="w-4 h-4 text-slate-500" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-500" />
                    )}
                  </div>

                  {/* Expanded content */}
                  {isOpen && (
                    <div className="border-t border-slate-700/60 px-5 py-4 space-y-4">
                      {/* Summary */}
                      <div>
                        <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">
                          AI Summary
                        </div>
                        <p className="text-sm text-slate-300 leading-relaxed">{theme.summary}</p>
                        <p className="text-[11px] text-slate-600 mt-1 italic">
                          Generated from {theme.linkedResponseIds.length} linked responses. Verify by reviewing source responses.
                        </p>
                      </div>

                      {/* Representative quotes */}
                      {theme.representativeQuotes.length > 0 && (
                        <div>
                          <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">
                            Representative quotes
                          </div>
                          <div className="space-y-2">
                            {theme.representativeQuotes.map((q, i) => (
                              <div
                                key={i}
                                className="text-xs text-slate-300 italic bg-slate-900/50 border border-slate-700/40 rounded px-3 py-2 leading-relaxed"
                              >
                                &ldquo;{q}&rdquo;
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex items-center gap-3">
                        {theme.questionId && (
                          <button
                            onClick={() => openDrawer(theme.questionId!, undefined)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-300 hover:text-white hover:border-slate-500 transition-colors"
                          >
                            <ExternalLink className="w-3 h-3" />
                            View source responses
                          </button>
                        )}
                        {theme.priority && (
                          <span className="text-xs text-slate-600">
                            Priority:{' '}
                            <span className="text-slate-400 font-medium">{theme.priority}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
