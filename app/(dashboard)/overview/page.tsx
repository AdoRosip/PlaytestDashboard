'use client';
import { useCallback, useEffect, useMemo } from 'react';
import Link from '@/components/layout/ReportLink';
import { useDashboardStore, selectAnyFilterActive, selectFilteredResponses, selectGameConfig } from '@/lib/store';
import type { OverviewInsightsInput, OverviewInsightsResult } from '@/app/api/overview-insights/route';
import { countRespondents } from '@/lib/responseStats';
import { filterThemesForResponses } from '@/lib/themeFiltering';
import { distributionOf, isChoiceQuestion, substantiveAnswers, textAnswers } from '@/lib/qualitative';
import QualitativeOverview from './QualitativeOverview';
import CoreExperienceScores from '@/components/overview/CoreExperienceScores';
import QuestionHighlights from '@/components/overview/QuestionHighlights';
import RecurringThemes from '@/components/overview/RecurringThemes';
import KeyTakeaways from '@/components/overview/KeyTakeaways';
import css from '@/components/overview/overview.module.css';
import { useCachedAnalysis } from '@/lib/useCachedAnalysis';
import { computeOverviewHeadlines } from '@/lib/overviewHeadlines';
import { categoryScoringResponses } from '@/lib/categoryScoring';
import { formatDurationMinutes, parseDurationMinutes } from '@/lib/duration';

// ─────────────────────────────────────────────────────────────────────────────
// Shared micro-components
// ─────────────────────────────────────────────────────────────────────────────

interface Kpi {
  key: string;
  label: string;
  /** Explains how the number is derived; shown as the label's hover title. */
  info: string;
  value: string;
  unit?: string;
  sub?: string;
  /** Overrides the value colour, e.g. to flag a worrying bug rate. */
  tone?: string;
  href?: string;
}

function KpiCell({ label, info, value, unit, sub, tone, href }: Kpi) {
  const body = (
    <>
      <div className={css.kpiLabel} title={info}>{label}</div>
      <div className={css.kpiValue} style={tone ? { color: tone } : undefined}>
        {value}{unit && <span className={css.kpiUnit}>{unit}</span>}
      </div>
      {sub && <div className={css.kpiSub} title={sub}>{sub}</div>}
    </>
  );
  const cls = `${css.kpiCell} groove-cell`;
  return href ? <Link href={href} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}

function parsePlaytimeHours(rawAnswer: string, numericValue: number | null): number | null {
  if (numericValue !== null && numericValue >= 0 && numericValue <= 1000) return numericValue;

  const raw = rawAnswer.toLowerCase().trim();
  const hoursMinutes = raw.match(/(\d+(?:\.\d+)?)\s*h(?:ours?)?\s*(?:(\d+)\s*m(?:in(?:ute)?s?)?)?/i);
  if (hoursMinutes) {
    const hours = Number(hoursMinutes[1]);
    const minutes = Number(hoursMinutes[2] ?? 0);
    return hours + minutes / 60;
  }

  const minutesOnly = raw.match(/(\d+(?:\.\d+)?)\s*m(?:in(?:ute)?s?)?\b/i);
  if (minutesOnly) return Number(minutesOnly[1]) / 60;

  const clock = raw.match(/\b(\d{1,2}):(\d{2})\b/);
  if (clock) return Number(clock[1]) + Number(clock[2]) / 60;

  return null;
}

function parseProgressTier(rawAnswer: string, numericValue: number | null): number | null {
  if (numericValue !== null && numericValue >= 0 && numericValue <= 50) return numericValue;

  const raw = rawAnswer.toLowerCase();
  const romanMap: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10 };
  const wordMap: Record<string, number> = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
    six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  };

  // "tier 3", "level: 4", "technology tier 2"
  const forward = raw.match(/\b(?:tier|level|stage|technology)\s*(?:reached|achieved|made|to|:|-|of)?\s*(\d+(?:\.\d+)?|viii|vii|vi|iv|ix|x|v|iii|ii|i|zero|one|two|three|four|five|six|seven|eight|nine|ten)\b/i);
  // "reached tier 3", "got to level 4", "made it to stage 2"
  const reverse = raw.match(/\b(?:reached?|got\s+to|made\s+it\s+to|achieved|unlocked)\s+(?:tier|level|stage)\s*(\d+(?:\.\d+)?|viii|vii|vi|iv|ix|x|v|iii|ii|i|zero|one|two|three|four|five|six|seven|eight|nine|ten)\b/i);
  const token = (forward ?? reverse)?.[1];
  if (!token) return null;

  const parsed = Number(token);
  if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 50) return parsed;
  return romanMap[token] ?? wordMap[token] ?? null;
}

function formatTierNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** "21 Sep – 3 Oct 2026": the year (and month) are only repeated when they change. */
function formatDateRange(start: Date, end: Date): string {
  const full = (x: Date) => x.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  if (start.toDateString() === end.toDateString()) return full(start);
  if (start.getFullYear() !== end.getFullYear()) return `${full(start)} – ${full(end)}`;
  if (start.getMonth() === end.getMonth()) return `${start.getDate()}–${full(end)}`;
  return `${start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${full(end)}`;
}

/** Category names that hold admin/recording fields rather than player feedback. */
const INTERNAL_CATEGORY = /admin|internal|evidence|background|recording/i;

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function OverviewPage() {
  // Dispatch on the active game's overview mode: qualitative (free-text-heavy
  // forms like Wannabe Trashman) gets a purpose-built layout; scoring
  // (rating-heavy forms like Exovia) keeps the category-scorecard layout below.
  const project = useDashboardStore((s) => s.project);
  const overviewMode = useDashboardStore((s) => selectGameConfig(s).overviewMode);
  if (project && overviewMode === 'qualitative') return <QualitativeOverview />;
  return <ScoringOverview />;
}

function ScoringOverview() {
  const project    = useDashboardStore(s => s.project);
  const questions  = useDashboardStore(s => s.questions);
  const responses  = useDashboardStore(selectFilteredResponses);
  const categories = useDashboardStore(s => s.categories);
  const themes     = useDashboardStore(s => s.themes);
  const themeStatus = useDashboardStore(s => s.analysisStatus);
  const themeError = useDashboardStore(s => s.analysisError);
  const runThemeAnalysis = useDashboardStore(s => s.runThemeAnalysis);
  const config     = useDashboardStore(selectGameConfig);
  const filtersActive = useDashboardStore(selectAnyFilterActive);
  const visibleThemes = useMemo(
    () => filterThemesForResponses(themes, responses, filtersActive),
    [themes, responses, filtersActive],
  );

  const d = useMemo(() => {
    // ── helpers ────────────────────────────────────────────────────────────
    const catStats = (catId: string) => {
      const vals = categoryScoringResponses(questions.filter(q => q.categoryId === catId), responses)
        .map(r => r.normalizedScore!);
      return vals.length >= 3 ? { avg: vals.reduce((a, b) => a + b, 0) / vals.length, n: vals.length } : null;
    };

    const qSentiment = (qId: string, max: number) => {
      const rs = responses.filter(r => r.questionId === qId && r.numericValue !== null);
      if (!rs.length) return null;
      const pos = rs.filter(r => r.numericValue! / max >= 0.6).length;
      const neg = rs.filter(r => r.numericValue! / max < 0.35).length;
      const p = (n: number) => Math.round((n / rs.length) * 100);
      return {
        avg: rs.reduce((s, r) => s + r.numericValue!, 0) / rs.length,
        positive: p(pos), positiveCount: pos, neutral: p(rs.length - pos - neg), negative: p(neg), n: rs.length, max,
      };
    };

    // ── Playtime stats ─────────────────────────────────────────────────────
    const playtimeQ = questions.find(q => q.type === 'duration') ?? questions.find(q =>
      !/factorio|satisfactory/i.test(q.text) &&
      /(?:how many|approximately|approx|total)?.*(?:hours|playtime|play time|time played).*(?:play|played|game|session)?|session.*(?:duration|length)/i.test(q.text)
    );
    const playtimeValues = playtimeQ
      ? responses
          .filter(r => r.questionId === playtimeQ.id)
          .flatMap(r => {
            const minutes = playtimeQ.type === 'duration' ? parseDurationMinutes(r.rawAnswer) : null;
            const hours = playtimeQ.type === 'duration'
              ? minutes === null ? null : minutes / 60
              : parsePlaytimeHours(r.rawAnswer, r.numericValue);
            return hours !== null ? [hours] : [];
          })
      : [];
    const avgPlaytime = playtimeValues.length
      ? playtimeValues.reduce((a, b) => a + b, 0) / playtimeValues.length
      : null;

    // ── Progress tier ──────────────────────────────────────────────────────
    const progressQ = questions.find(q =>
      /max(?:imum)?.*(?:tier|level|stage).*reached|(?:tier|level|stage).*reached|how far.*progress|progress.*during.*session|technology tier|automation stage|average progress/i.test(q.text)
    );
    const progressValues = progressQ
      ? responses
          .filter(r => r.questionId === progressQ.id)
          .flatMap(r => {
            const tier = parseProgressTier(r.rawAnswer, r.numericValue);
            return tier !== null ? [tier] : [];
          })
      : [];
    const maxTier = progressValues.length ? Math.max(...progressValues) : null;
    const maxTierCount = maxTier !== null ? progressValues.filter(v => v === maxTier).length : 0;
    const avgTier = progressValues.length
      ? progressValues.reduce((a, b) => a + b, 0) / progressValues.length
      : null;

    // ── KPI questions (config-driven — see the active game's config.kpis) ────
    // Each KPI is matched to a question by regex; we use the question's detected
    // scale, falling back to the KPI's declared scaleMax.
    const kpiQuestionIds = new Set<string>();
    const kpiStats = config.kpis.map((kpi) => {
      const qq = questions.find((q) => kpi.pattern.test(q.text));
      if (qq) kpiQuestionIds.add(qq.id);
      return { key: kpi.key, label: kpi.label, stats: qq ? qSentiment(qq.id, qq.scaleMax ?? kpi.scaleMax) : null };
    });

    // ── Generic headline tiles (overall / recommend / play again / bugs) ────
    // Shown only when the form asks the matching question; skips any question
    // a config KPI tile above already covers.
    const headlines = computeOverviewHeadlines(questions, responses, kpiQuestionIds);

    // ── Tutorial completion ────────────────────────────────────────────────
    const tutorialQ = questions.find(q =>
      /tutorial|onboarding/i.test(q.text) &&
      (q.type === 'yes_no' || q.type === 'multiple_choice')
    );
    const tutorialResponses = tutorialQ
      ? responses.filter(r => r.questionId === tutorialQ.id)
      : [];
    const tutorialPct = tutorialResponses.length > 0
      ? Math.round(
          tutorialResponses.filter(r => /yes|true|completed|done|1/i.test(r.rawAnswer)).length
          / tutorialResponses.length * 100
        )
      : null;

    // ── Category scores ────────────────────────────────────────────────────
    const catScores = categories
      .filter(c => !INTERNAL_CATEGORY.test(c.name))
      .flatMap(c => { const s = catStats(c.id); return s ? [{ ...c, avg: s.avg, n: s.n }] : []; })
      .sort((a, b) => b.avg - a.avg);

    // ── Evidence for the AI takeaways ──────────────────────────────────────
    // Open-ended answers and choice splits, skipping admin/internal sections.
    const internalCats = new Set(categories.filter(c => INTERNAL_CATEGORY.test(c.name)).map(c => c.id));
    const feedbackQs = questions.filter(q => !q.categoryId || !internalCats.has(q.categoryId));
    const freeText = feedbackQs
      .filter(q => q.type === 'free_text')
      .map(q => ({ question: q.text, answers: substantiveAnswers(responses, q.id) }))
      .filter(f => f.answers.length > 0);
    const choices = feedbackQs
      .filter(isChoiceQuestion)
      .map(q => ({
        question: q.text,
        options: distributionOf(textAnswers(responses, q.id)).map(b => ({ label: b.label, pct: b.pct })),
      }))
      .filter(c => c.options.length > 0);

    // ── Best & worst rated questions ───────────────────────────────────────
    // Average normalized score per rating question (excluding admin/internal).
    // Requires a small sample so a single answer can't top or bottom the list.
    const MIN_SAMPLE = 3;
    const categoryName = new Map(categories.map(c => [c.id, c.name]));
    const questionScores = questions
      .filter(q => q.categoryId !== null && !/cat_15|admin|internal/i.test(q.categoryId))
      .map(q => {
        const rs = responses.filter(r => r.questionId === q.id && r.normalizedScore !== null);
        if (rs.length < MIN_SAMPLE) return null;
        const avg = Math.round(rs.reduce((s, r) => s + (r.normalizedScore ?? 0), 0) / rs.length);
        return { id: q.id, text: q.text, category: categoryName.get(q.categoryId!) ?? null, score: avg, n: rs.length };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.score - a.score);

    // Show up to 3 each, never letting the same question appear in both lists.
    const perSide = Math.min(3, Math.floor(questionScores.length / 2));
    const bestQuestions = questionScores.slice(0, perSide);
    const worstQuestions = questionScores.slice(questionScores.length - perSide).reverse();

    // ── Date range ─────────────────────────────────────────────────────────
    const timestamps = responses
      .map(r => new Date(r.submittedAt).getTime())
      .filter(t => !isNaN(t));
    const dateRange = timestamps.length > 0 ? {
      start: new Date(Math.min(...timestamps)),
      end:   new Date(Math.max(...timestamps)),
    } : null;

    return {
      catScores,
      freeText,
      choices,
      avgPlaytime,
      playtimeN: playtimeValues.length,
      maxTier,
      maxTierCount,
      avgTier,
      tierN: progressValues.length,
      kpiStats,
      headlines,
      tutorialPct,
      bestQuestions,
      worstQuestions,
      dateRange,
    };
  }, [questions, responses, categories, config]);

  // ── AI key takeaways (auto-run, cached) ───────────────────────────────────
  const insightsPayload = useMemo((): OverviewInsightsInput => {
    const kpis: OverviewInsightsInput['kpis'] = d.kpiStats.flatMap(({ label, stats }) => stats
      ? [{ label, avg: stats.avg, max: stats.max, positivePct: stats.positive, negativePct: stats.negative }]
      : []);
    const { overall, recommend, playAgain } = d.headlines;
    if (overall) kpis.push({ label: 'Overall rating', avg: overall.avg, max: overall.max, positivePct: overall.highPct, negativePct: null });
    if (recommend) kpis.push({ label: 'Would recommend (% in top two points)', avg: recommend.pct, max: 100, positivePct: null, negativePct: null });
    if (playAgain) kpis.push({ label: 'Would play again (% in top two points)', avg: playAgain.pct, max: 100, positivePct: null, negativePct: null });
    return {
      gameName: project?.gameName || project?.name || '',
      kpis,
      choices: d.choices,
      freeText: d.freeText,
      categories: d.catScores.map(c => ({ name: c.name, score: Math.round(c.avg), n: c.n })),
      ratedQuestions: [
        ...d.bestQuestions.map(q => ({ question: q.text, score: q.score, side: 'best' as const })),
        ...d.worstQuestions.map(q => ({ question: q.text, score: q.score, side: 'worst' as const })),
      ],
    };
  }, [project?.gameName, project?.name, d]);

  const fetchInsights = useCallback(async (): Promise<OverviewInsightsResult> => {
    const res = await fetch('/api/overview-insights', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(insightsPayload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
    return data as OverviewInsightsResult;
  }, [insightsPayload]);

  // Quotes have to come from somewhere, so only analyse once testers wrote text.
  const hasInsightInput = d.freeText.length > 0;
  const insightsSignature = useMemo(
    () => (hasInsightInput ? JSON.stringify(insightsPayload) : ''),
    [hasInsightInput, insightsPayload],
  );

  const insights = useCachedAnalysis<OverviewInsightsResult>({
    key: 'overviewInsights',
    signature: insightsSignature,
    // The unfiltered view analyses itself; a filtered cohort is asked for explicitly.
    auto: !filtersActive,
    fetcher: fetchInsights,
  });

  // Recurring themes: auto-run once per dataset. Themes persist in the store
  // and the endpoint always analyses the full imported set, so filters never
  // invalidate them.
  useEffect(() => {
    if (!hasInsightInput || themes.length > 0 || themeStatus !== 'idle') return;
    void runThemeAnalysis();
  }, [hasInsightInput, themes.length, themeStatus, runThemeAnalysis]);

  if (!project) return null;

  // Portal projects have no createdAt, so only show a date that actually parses.
  const created = new Date(project.createdAt);
  const dateStr = Number.isNaN(created.getTime()) ? null : created.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const participantCount = countRespondents(responses);
  const gameName = project.gameName || project.name;

  const metaParts = [
    `${participantCount} testers`,
    d.dateRange ? formatDateRange(d.dateRange.start, d.dateRange.end) : dateStr,
  ].filter(Boolean);

  // ── KPI strip: only the cells the form's questions support ───────────────
  const kpis: Kpi[] = [];
  for (const { key, label, stats } of d.kpiStats) {
    if (!stats) continue;
    kpis.push({
      key,
      label,
      info: `Average rating from the "${label}" question, matched automatically by keywords. Shown as average / scale max. Sub-label: testers who rated it positively / testers who answered.`,
      value: stats.avg.toFixed(1),
      unit: `/${stats.max}`,
      sub: `${stats.positiveCount}/${stats.n} testers`,
    });
  }
  const { overall, recommend, playAgain, bugs } = d.headlines;
  if (overall) kpis.push({
    key: 'overall', label: 'Overall rating',
    info: 'Average answer to the overall-experience rating question. Sub-label: number of testers who answered.',
    value: overall.avg.toFixed(1), unit: `/${overall.max}`,
    sub: `${overall.n} ${overall.n === 1 ? 'tester' : 'testers'}`,
  });
  if (recommend) kpis.push({
    key: 'recommend', label: 'Would recommend',
    info: "Share of testers who answered in the top two points of the 'recommend to a friend' rating question.",
    value: String(recommend.pct), unit: '%',
    sub: `${recommend.count}/${recommend.n} testers`,
  });
  if (playAgain) kpis.push({
    key: 'playAgain', label: 'Would play again',
    info: "Share of testers who answered in the top two points of the 'play again' rating question.",
    value: String(playAgain.pct), unit: '%',
    sub: `${playAgain.count}/${playAgain.n} testers`,
  });
  if (bugs) kpis.push({
    key: 'bugs', label: 'Hit a bug',
    info: 'Share of testers who answered Yes to the bugs / crashes question. Highlighted when half or more of testers hit an issue.',
    value: String(bugs.pct), unit: '%',
    sub: `${bugs.count} of ${bugs.n} testers`,
    tone: bugs.pct >= 50 ? '#E8C547' : undefined,
  });
  if (d.avgTier !== null) kpis.push({
    key: 'progression', label: 'Progression reached',
    info: "Average tier/level reached across testers, parsed from the progress question. Accepts numbers, Roman numerals, and word forms (e.g. 'reached Tier III'). Sub-label shows the single furthest tier hit by any tester.",
    value: formatTierNumber(d.avgTier), unit: 'avg tier',
    sub: `furthest Tier ${formatTierNumber(d.maxTier!)} · n=${d.tierN}`,
  });
  if (d.tutorialPct !== null) kpis.push({
    key: 'tutorial', label: 'Completed tutorial',
    info: "% of testers who answered yes / completed / done on a tutorial or onboarding question (yes-no or multiple-choice type). Matched by keywords like 'tutorial' or 'onboarding'.",
    value: String(d.tutorialPct), unit: '%', sub: 'of testers finished tutorial',
  });
  if (d.avgPlaytime !== null) kpis.push({
    key: 'duration', label: 'Average duration',
    info: 'Average reported session duration among the visible responses with a valid duration. Portal Duration answers are in minutes.',
    value: formatDurationMinutes(d.avgPlaytime * 60),
    sub: `${d.playtimeN} ${d.playtimeN === 1 ? 'response' : 'responses'} with duration`,
  });
  kpis.push({
    key: 'tests', label: 'Tests completed',
    info: 'Number of unique testers with at least one recorded response.',
    value: String(participantCount),
    sub: participantCount === project.totalResponses ? 'all tests shown' : `${participantCount} of ${project.totalResponses} shown`,
    href: '/testers',
  });

  return (
    <div className={css.page}>

      {/* ── HEADER ───────────────────────────────────────────────────── */}
      <header className={css.header}>
        <div className={css.headerText}>
          <h1 className={css.title}>
            {gameName}
          </h1>
          <div className={css.meta}>{metaParts.join(' · ')}</div>
        </div>
      </header>

      {/* ── KPI STRIP ────────────────────────────────────────────────── */}
      <div className={`${css.kpiStrip} groove-y`}>
        {kpis.map(({ key, ...kpi }) => <KpiCell key={key} {...kpi} />)}
      </div>

      {/* ── CORE EXPERIENCE SCORES ───────────────────────────────────── */}
      <CoreExperienceScores categories={d.catScores} />

      {/* ── KEY TAKEAWAYS ─────────────────────────────────────────────── */}
      <KeyTakeaways {...insights} hasInput={hasInsightInput} filtersActive={filtersActive} />

      {/* ── BEST & WORST · RECURRING THEMES ─────────────────────────── */}
      <div className={`${css.bottomRow} groove-b`}>
        <section className={`${css.col} ${css.colQuestions} groove-cell`}>
          <QuestionHighlights best={d.bestQuestions} worst={d.worstQuestions} />
        </section>

        <section className={`${css.col} ${css.colThemes} groove-cell`}>
          <RecurringThemes
            themes={themes}
            visible={visibleThemes}
            status={themeStatus}
            error={themeError}
            run={() => void runThemeAnalysis()}
            hasInput={hasInsightInput}
          />
        </section>
      </div>

    </div>
  );
}
