'use client';
import { useCallback, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  Users, Star, Sparkles, ThumbsUp, ThumbsDown, Lightbulb,
  MessageSquareText, ListChecks, TrendingDown, PenLine, Loader2, RefreshCw,
} from 'lucide-react';
import { useDashboardStore, selectActiveFilterCount, selectFilteredResponses, selectFilteredTesters, selectGameConfig } from '@/lib/store';
import { countRespondents } from '@/lib/responseStats';
import { engagement } from '@/lib/testerProfile';
import {
  distributionOf, semiStructured, ratingDistribution, ratingSentiment,
  numericAnswers, textAnswers, isChoiceQuestion,
} from '@/lib/qualitative';
import type { OverviewInsightsResult } from '@/app/api/overview-insights/route';
import CompanyLogo from '@/components/brand/CompanyLogo';
import InfoTooltip from '@/components/ui/InfoTooltip';
import ExpandableOverviewSection from '@/components/ui/ExpandableOverviewSection';
import ScaleTrack from '@/components/ui/ScaleTrack';
import { useCachedAnalysis } from '@/lib/useCachedAnalysis';
import { filterThemesForResponses } from '@/lib/themeFiltering';

const COMMERCIAL_KEY = /wishlist|recommend|nps|continue|retention/i;
const NON_ANSWERS = new Set(['no', 'n/a', 'na', 'none', 'nope', 'nothing', 'idk', '-', '.', 'yes']);
const PRIORITY_STYLE: Record<string, string> = {
  Critical: 'bg-red-500/15 text-red-300 border-red-500/30',
  High: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  Medium: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  Low: 'bg-slate-600/20 text-slate-300 border-slate-600/40',
};

function readiness(ratio: number): { label: string; tone: string } {
  if (ratio >= 0.7) return { label: 'Strong', tone: 'text-emerald-400' };
  if (ratio >= 0.5) return { label: 'Promising', tone: 'text-sky-400' };
  return { label: 'Lukewarm', tone: 'text-amber-400' };
}

export default function QualitativeOverview() {
  const project    = useDashboardStore((s) => s.project);
  const responses  = useDashboardStore(selectFilteredResponses);
  const testers    = useDashboardStore(selectFilteredTesters);
  const questions  = useDashboardStore((s) => s.questions);
  const themes     = useDashboardStore((s) => s.themes);
  const themeAnalysisStatus = useDashboardStore((s) => s.analysisStatus);
  const themeAnalysisError = useDashboardStore((s) => s.analysisError);
  const runThemeAnalysis = useDashboardStore((s) => s.runThemeAnalysis);
  const config     = useDashboardStore(selectGameConfig);
  const openDrawer = useDashboardStore((s) => s.openDrawer);
  const filtersActive = useDashboardStore(selectActiveFilterCount) > 0;
  const visibleThemes = useMemo(
    () => filterThemesForResponses(themes, responses, filtersActive),
    [themes, responses, filtersActive],
  );

  const d = useMemo(() => {
    const adminCatIds = new Set(
      config.categories.filter((c) => /admin|internal/i.test(c.name)).map((c) => c.id),
    );
    const isAdmin = (qCatId: string | null) => !!qCatId && adminCatIds.has(qCatId);

    // KPI cards from config.kpis
    const kpis = config.kpis.map((kpi) => {
      const q = questions.find((qq) => kpi.pattern.test(qq.text));
      const max = q?.scaleMax ?? kpi.scaleMax;
      const nums = q ? numericAnswers(responses, q.id) : [];
      return {
        key: kpi.key,
        label: kpi.label,
        max,
        questionId: q?.id ?? null,
        sentiment: ratingSentiment(nums, max),
        dist: ratingDistribution(nums, max),
        isCommercial: COMMERCIAL_KEY.test(kpi.key) || COMMERCIAL_KEY.test(kpi.label),
      };
    });
    const commercial = kpis.find((k) => k.isCommercial && k.sentiment) ?? kpis.find((k) => k.sentiment) ?? null;

    // Choice-question demand bars
    const choiceQuestions = questions
      .filter((q) => isChoiceQuestion(q) && !isAdmin(q.categoryId))
      .map((q) => ({ q, buckets: distributionOf(textAnswers(responses, q.id)) }))
      .filter((c) => c.buckets.length > 0);

    // Semi-structured prose → yes/no/maybe
    const semi = questions
      .filter((q) => q.type === 'free_text' && !isAdmin(q.categoryId))
      .map((q) => ({ q, s: semiStructured(textAnswers(responses, q.id)) }))
      .filter((x) => x.s.total >= 5 && x.s.classifiedRatio >= 0.35)
      .sort((a, b) => b.s.classifiedRatio - a.s.classifiedRatio);

    // Free-text Q&A for the AI insights call (substantive answers only, capped).
    const freeText = questions
      .filter((q) => q.type === 'free_text' && !isAdmin(q.categoryId))
      .map((q) => ({
        question: q.text,
        answers: textAnswers(responses, q.id)
          .map((a) => a.trim())
          .filter((a) => a.length > 3 && !NON_ANSWERS.has(a.toLowerCase()))
          .slice(0, 18),
      }))
      .filter((f) => f.answers.length > 0);

    const detailedResponders = testers.filter(
      (t) => engagement(t.id, responses, questions).tier === 'detailed',
    ).length;

    return { kpis, commercial, choiceQuestions, semi, freeText, detailedResponders };
  }, [config, questions, responses, testers]);

  // ── AI Key Takeaways ──────────────────────────────────────────────────────
  const insightsPayload = useMemo(() => ({
    gameName: project?.gameName ?? '',
    kpis: d.kpis.map((k) => ({
      label: k.label,
      avg: k.sentiment?.avg ?? null,
      max: k.max,
      positivePct: k.sentiment?.positive ?? null,
      negativePct: k.sentiment?.negative ?? null,
    })),
    choices: d.choiceQuestions.map((c) => ({
      question: c.q.text,
      options: c.buckets.map((b) => ({ label: b.label, pct: b.pct })),
    })),
    freeText: d.freeText,
  }), [project?.gameName, d.kpis, d.choiceQuestions, d.freeText]);

  const fetchInsights = useCallback(async (): Promise<OverviewInsightsResult> => {
    const res = await fetch('/api/overview-insights', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(insightsPayload),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
    return body as OverviewInsightsResult;
  }, [insightsPayload]);

  // Only auto-run once there is something to analyse. Filtering does NOT
  // auto-run: a filtered cohort is a different (paid) question, so the user asks
  // for it explicitly via Re-run.
  const insightsSignature = useMemo(
    () => (d.freeText.length > 0 ? JSON.stringify(insightsPayload) : ''),
    [d.freeText.length, insightsPayload],
  );

  const {
    data: insights,
    loading: insightsLoading,
    error: insightsError,
    run: generateInsights,
  } = useCachedAnalysis<OverviewInsightsResult>({
    key: 'overviewInsights',
    signature: insightsSignature,
    auto: !filtersActive,
    fetcher: fetchInsights,
  });

  // Recurring themes: auto-run once per dataset. Cheap to guard because themes
  // already persist in the store and the endpoint always analyses the full
  // imported set, so filters never invalidate it.
  useEffect(() => {
    if (d.freeText.length === 0) return;
    if (themes.length > 0) return;
    if (themeAnalysisStatus !== 'idle') return;
    void runThemeAnalysis();
  }, [d.freeText.length, themes.length, themeAnalysisStatus, runThemeAnalysis]);

  if (!project) return null;
  const participants = countRespondents(responses);
  const dateStr = new Date(project.createdAt).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  return (
    <div className="min-h-screen mx-auto w-full max-w-[1680px] px-4 md:px-6 lg:px-8 py-10">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1">
            Playlytix Report Overview
          </div>
          <div className="flex items-center gap-3">
            <CompanyLogo className="w-12" priority />
            <h1 className="text-[2rem] font-bold text-white tracking-tight leading-none">
              {project.gameName || project.name}
            </h1>
          </div>
          <div className="flex items-center gap-3 mt-3 flex-wrap text-sm text-slate-400">
            <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-slate-500" />{participants} testers</span>
            <span className="text-slate-700">·</span>
            <span className="flex items-center gap-1.5"><PenLine className="w-3.5 h-3.5 text-slate-500" />{d.detailedResponders} detailed responders</span>
            <span className="text-slate-700">·</span>
            <span>{dateStr}</span>
          </div>
        </div>
        {/* "Download Full Report" removed — it promised a curated report but
            only linked to the CSV export page. Reinstate once there is a
            decision on what the report should actually contain. */}
      </div>

      {/* Commercial signal + KPI distributions */}
      <ExpandableOverviewSection title="Headline Signals">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        {d.kpis.map((kpi) => (
          <div key={kpi.key} className={`rounded-2xl border p-5 ${kpi.isCommercial ? 'border-indigo-600/40 bg-indigo-500/5' : 'border-slate-700/60 bg-slate-800/20'}`}>
            <div className="flex items-center gap-2 mb-3">
              {kpi.isCommercial ? <ThumbsUp className="w-4 h-4 text-indigo-400" /> : <Star className="w-4 h-4 text-slate-400" />}
              <span className="text-sm font-semibold text-white">{kpi.label}</span>
              {kpi.isCommercial && <span className="text-[10px] uppercase tracking-wide text-indigo-300/80">commercial signal</span>}
            </div>
            {kpi.sentiment ? (
              <>
                <div className="flex items-end gap-2 mb-3">
                  <div className="text-3xl font-bold text-white">{kpi.sentiment.avg.toFixed(1)}</div>
                  <div className="text-sm text-slate-500 mb-1">/ {kpi.max}</div>
                  {kpi.isCommercial && (() => { const r = readiness(kpi.sentiment.avg / kpi.max); return <div className={`text-xs font-semibold mb-1 ml-auto ${r.tone}`}>{r.label}</div>; })()}
                </div>
                {/* Where that average sits on the question's own scale. */}
                <div className="mb-4">
                  <ScaleTrack value={kpi.sentiment.avg} max={kpi.max} />
                </div>
                {/* distribution */}
                <div className="flex items-end gap-1 h-16 mb-2">
                  {kpi.dist.map((b) => {
                    const maxCount = Math.max(...kpi.dist.map((x) => x.count), 1);
                    return (
                      <button
                        key={b.value}
                        onClick={() => kpi.questionId && openDrawer(kpi.questionId, b.value)}
                        className="flex-1 flex flex-col items-center justify-end group"
                        title={`${b.count} rated ${b.value}`}
                      >
                        <div className="w-full rounded-t bg-gradient-to-t from-indigo-600/70 to-cyan-500/70 group-hover:from-indigo-500 group-hover:to-cyan-400 transition-colors" style={{ height: `${(b.count / maxCount) * 100}%` }} />
                        <div className="text-[10px] text-slate-500 mt-1">{b.value}</div>
                      </button>
                    );
                  })}
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-emerald-400">{kpi.sentiment.positive}% positive</span>
                  <span className="text-slate-500">{kpi.sentiment.neutral}% neutral</span>
                  <span className="text-amber-400">{kpi.sentiment.negative}% negative</span>
                </div>
              </>
            ) : (
              <div className="text-sm text-slate-600 py-4">No matching question detected</div>
            )}
          </div>
        ))}
      </div>
      </ExpandableOverviewSection>

      {/* AI Key Takeaways — strengths, concerns, recommendations */}
      <ExpandableOverviewSection title="Key Takeaways">
      <div className="rounded-2xl border border-slate-700/60 bg-slate-800/20 p-5 mb-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <h2 className="text-sm font-semibold text-white">Key Takeaways</h2>
            <span className="text-[10px] uppercase tracking-wide text-indigo-300/70">AI</span>
          </div>
          {insights && !insightsLoading && (
            <button
              onClick={generateInsights}
              className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-indigo-600/20 border border-indigo-500/40 text-indigo-300 hover:bg-indigo-600/30 transition-colors"
            >
              <RefreshCw className="w-3 h-3" /> Re-run
            </button>
          )}
        </div>

        {!insights && d.freeText.length === 0 && (
          <p className="text-xs text-slate-600 py-6 text-center">Not enough open-ended answers to analyse.</p>
        )}

        {!insights && d.freeText.length > 0 && insightsLoading && !insightsError && (
          <div className="flex items-center justify-center gap-2 py-10 text-slate-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Analysing {d.freeText.reduce((n, f) => n + f.answers.length, 0)} open-ended answers…
          </div>
        )}

        {/* Only reachable with filters active: the unfiltered view analyses itself
            on load, but a filtered cohort is a separate paid request the user asks
            for deliberately. */}
        {!insights && d.freeText.length > 0 && !insightsLoading && !insightsError && filtersActive && (
          <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/30 p-6 text-center">
            <p className="text-sm text-slate-300 mb-1">Analyse this filtered cohort?</p>
            <p className="text-xs text-slate-500 mb-4">
              Takeaways are generated automatically for the full set. This sends the {' '}
              {d.freeText.reduce((n, f) => n + f.answers.length, 0)} answers from the current filter to OpenAI.
            </p>
            <button
              onClick={generateInsights}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" /> Analyse cohort
            </button>
          </div>
        )}

        {d.freeText.length > 0 && !insights && insightsError && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-5 text-center">
            <p className="text-sm text-red-300 mb-3">{insightsError}</p>
            <button onClick={generateInsights} disabled={insightsLoading} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white transition-colors">
              <RefreshCw className={`w-3.5 h-3.5 ${insightsLoading ? 'animate-spin' : ''}`} /> Retry
            </button>
          </div>
        )}

        {d.freeText.length > 0 && insights && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Strengths */}
            <div>
              <div className="flex items-center gap-1.5 mb-2 text-emerald-300"><ThumbsUp className="w-3.5 h-3.5" /><span className="text-xs font-semibold uppercase tracking-wide">Strengths</span></div>
              <div className="space-y-2">
                {insights.strengths.map((s, i) => (
                  <div key={i} className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                    <div className="text-xs font-semibold text-slate-200">{s.title}</div>
                    <div className="text-[11px] text-slate-400 leading-relaxed mt-0.5">{s.detail}</div>
                    {s.quote && <div className="text-[11px] text-emerald-300/80 italic mt-1.5">&ldquo;{s.quote}&rdquo;</div>}
                  </div>
                ))}
              </div>
            </div>
            {/* Concerns */}
            <div>
              <div className="flex items-center gap-1.5 mb-2 text-amber-300"><ThumbsDown className="w-3.5 h-3.5" /><span className="text-xs font-semibold uppercase tracking-wide">Concerns</span></div>
              <div className="space-y-2">
                {insights.concerns.map((c, i) => (
                  <div key={i} className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                    <div className="text-xs font-semibold text-slate-200">{c.title}</div>
                    <div className="text-[11px] text-slate-400 leading-relaxed mt-0.5">{c.detail}</div>
                    {c.quote && <div className="text-[11px] text-amber-300/80 italic mt-1.5">&ldquo;{c.quote}&rdquo;</div>}
                  </div>
                ))}
              </div>
            </div>
            {/* Recommendations */}
            <div>
              <div className="flex items-center gap-1.5 mb-2 text-indigo-300"><Lightbulb className="w-3.5 h-3.5" /><span className="text-xs font-semibold uppercase tracking-wide">Recommendations</span></div>
              <div className="space-y-2">
                {insights.recommendations.map((r, i) => (
                  <div key={i} className="rounded-lg border border-indigo-500/20 bg-indigo-500/5 p-3">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="text-xs font-semibold text-slate-200 truncate">{r.area}</div>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full border flex-shrink-0 ${PRIORITY_STYLE[r.priority] ?? PRIORITY_STYLE.Low}`}>{r.priority}</span>
                    </div>
                    <div className="text-[11px] text-slate-400 leading-relaxed">{r.problem}</div>
                    <div className="text-[11px] text-indigo-200 leading-relaxed mt-1">→ {r.recommendation}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
      </ExpandableOverviewSection>

      {/* Feature demand + recurring feedback themes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        {/* Feature demand */}
        <ExpandableOverviewSection title="Feature Demand">
        <div className="rounded-2xl border border-slate-700/60 bg-slate-800/20 p-5">
          <div className="flex items-center gap-2 mb-1">
            <ListChecks className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-semibold text-white">Feature Demand</h2>
            <InfoTooltip text="Direct-choice questions (yes/no & multiple choice) from the form, as demand signals." />
          </div>
          <p className="text-xs text-slate-400 mb-4">What players explicitly asked for</p>
          {d.choiceQuestions.length === 0 ? (
            <p className="text-xs text-slate-600">No choice questions in this form.</p>
          ) : (
            <div className="space-y-4">
              {d.choiceQuestions.map(({ q, buckets }) => (
                <div key={q.id}>
                  <div className="text-xs text-slate-300 mb-2 leading-snug">{q.text}</div>
                  <div className="space-y-1.5">
                    {buckets.slice(0, 4).map((b) => (
                      <button key={b.label} onClick={() => openDrawer(q.id)} className="w-full grid grid-cols-[1fr_auto] items-center gap-2 group">
                        <div className="h-6 rounded bg-slate-700/40 overflow-hidden relative">
                          <div className="h-full rounded bg-gradient-to-r from-cyan-600/60 to-cyan-400/60" style={{ width: `${b.pct}%` }} />
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-slate-200 truncate max-w-[85%]">{b.label}</span>
                        </div>
                        <span className="text-[11px] text-slate-400 tabular-nums w-14 text-right">{b.pct}% · {b.count}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        </ExpandableOverviewSection>

        {/* Recurring feedback themes */}
        <ExpandableOverviewSection title="Recurring Feedback Themes">
        <div className="rounded-2xl border border-slate-700/60 bg-slate-800/20 p-5">
          <div className="flex items-center gap-2 mb-1">
            <MessageSquareText className="w-4 h-4 text-indigo-400" />
            <h2 className="text-sm font-semibold text-white">Recurring Feedback Themes</h2>
            <span className="text-[10px] uppercase tracking-wide text-indigo-300/70">AI</span>
          </div>
          <p className="text-xs text-slate-400 mb-4">Repeated patterns found across open-ended answers</p>
          {d.freeText.length === 0 && (
            <p className="text-xs text-slate-600 py-6 text-center">
              Not enough open-ended answers to identify recurring themes.
            </p>
          )}

          {d.freeText.length > 0 && themes.length === 0 && themeAnalysisStatus === 'running' && (
              <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/30 p-5 text-center">
                <Loader2 className="w-5 h-5 text-indigo-400 mx-auto mb-2 animate-spin" />
                <p className="text-sm text-slate-300">Finding recurring patterns in player feedback…</p>
              </div>
          )}

          {/* No manual CTA here — theme analysis starts on load and its result is
              persisted, so the idle state is momentary. */}

          {d.freeText.length > 0 && themes.length === 0 && themeAnalysisStatus === 'done' && (
            <p className="text-xs text-slate-600 py-6 text-center">
              No recurring themes were found.
            </p>
          )}

          {d.freeText.length > 0 && themes.length === 0 && themeAnalysisStatus === 'error' && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-5 text-center">
              <p className="text-sm text-red-300 mb-3">
                {themeAnalysisError ?? 'Theme analysis failed'}
              </p>
              <button
                onClick={() => void runThemeAnalysis()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Retry
              </button>
            </div>
          )}

          {d.freeText.length > 0 && themes.length > 0 && visibleThemes.length === 0 && (
            <p className="text-xs text-slate-500 py-6 text-center">
              No stored theme has linked evidence in the current filtered cohort.
            </p>
          )}

          {d.freeText.length > 0 && visibleThemes.length > 0 && (
            <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
              {[...visibleThemes]
                .sort((a, b) => (b.frequency ?? 0) - (a.frequency ?? 0))
                .slice(0, 8)
                .map((t) => (
                  <div key={t.id} className="rounded-lg border border-slate-700/50 bg-slate-900/30 p-3">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-semibold text-slate-200">{t.label}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                        t.severity === 'Critical' || t.severity === 'High' ? 'bg-amber-500/15 text-amber-300' : 'bg-slate-700/50 text-slate-400'
                      }`}>{t.severity}</span>
                    </div>
                    {t.summary && <p className="text-[11px] text-slate-400 leading-relaxed">{t.summary}</p>}
                  </div>
                ))}
              <Link href="/themes" className="block text-center text-xs text-indigo-400 hover:text-indigo-300 pt-1">
                View all recurring themes →
              </Link>
            </div>
          )}
        </div>
        </ExpandableOverviewSection>
      </div>

      {/* Quantified qualitative strip */}
      {d.semi.length > 0 && (
        <ExpandableOverviewSection title="Quantified Qualitative">
        <div className="rounded-2xl border border-slate-700/60 bg-slate-800/20 p-5 mb-8">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown className="w-4 h-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-white">Quantified Qualitative</h2>
            <InfoTooltip text="Open-ended questions whose answers mostly begin yes / no / maybe, aggregated into a sentiment split. A quick read; run AI analysis for nuance." />
          </div>
          <p className="text-xs text-slate-400 mb-4">Prose questions that are secretly yes/no/maybe — click a bar for the raw answers</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
            {d.semi.map(({ q, s }) => {
              const seg = [
                { key: 'yes', pct: Math.round((s.yes / s.total) * 100), color: 'bg-emerald-500/70', label: 'Yes' },
                { key: 'maybe', pct: Math.round((s.maybe / s.total) * 100), color: 'bg-sky-500/70', label: 'Maybe' },
                { key: 'no', pct: Math.round((s.no / s.total) * 100), color: 'bg-amber-500/70', label: 'No' },
                { key: 'other', pct: Math.round((s.other / s.total) * 100), color: 'bg-slate-600/60', label: 'Other' },
              ];
              return (
                <button key={q.id} onClick={() => openDrawer(q.id)} className="text-left group">
                  <div className="text-xs text-slate-300 mb-1.5 leading-snug group-hover:text-white truncate" title={q.text}>{q.text}</div>
                  <div className="flex h-5 rounded overflow-hidden">
                    {seg.filter((x) => x.pct > 0).map((x) => (
                      <div key={x.key} className={`${x.color} flex items-center justify-center`} style={{ width: `${x.pct}%` }} title={`${x.label}: ${x.pct}%`}>
                        {x.pct >= 12 && <span className="text-[10px] text-white/90">{x.pct}%</span>}
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-3 mt-1 text-[10px] text-slate-500">
                    <span className="text-emerald-400">Yes {s.yes}</span>
                    <span className="text-sky-400">Maybe {s.maybe}</span>
                    <span className="text-amber-400">No {s.no}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        </ExpandableOverviewSection>
      )}
    </div>
  );
}
