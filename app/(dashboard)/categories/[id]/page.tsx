'use client';
import { use, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import Link from '@/components/layout/ReportLink';
import { LayoutGrid, Sparkles } from 'lucide-react';
import { useDashboardStore, selectAnyFilterActive, selectSegmentFilteredResponses } from '@/lib/store';
import QuestionSummaryDialog from '@/components/ui/QuestionSummaryDialog';
import { questionTypeLabel, computeRatingDistribution } from '@/lib/utils';
import { isRatingType } from '@/lib/scoring';
import RatingBarChart from '@/components/charts/RatingBarChart';
import ChoiceBarChart from '@/components/charts/ChoiceBarChart';
import { countRespondents } from '@/lib/responseStats';
import {
  buildPerQuestionSets,
  matchingTesterIds,
  applyDrill as applyDrillIds,
  numericDrillValues,
  computeChoiceDistribution,
} from '@/lib/crossFilter';
import type { Question, Response } from '@/lib/types';
import { filterThemesForResponses } from '@/lib/themeFiltering';
import { scoreBandColor } from '@/lib/coreScores';
import { categoryScoringResponses } from '@/lib/categoryScoring';
import { durationDistribution, formatDurationMinutes, parseDurationMinutes } from '@/lib/duration';
import css from './category.module.css';

type ChartLayout = 'large' | 'medium' | 'small';
const CHART_LAYOUT_KEY = 'category-chart-layout';
function readChartLayout(): ChartLayout {
  let stored: string | null = null;
  try { stored = sessionStorage.getItem(CHART_LAYOUT_KEY); } catch { /* storage blocked */ }
  return stored === 'large' || stored === 'small' ? stored : 'medium';
}
function subscribeChartLayout(onChange: () => void) {
  window.addEventListener(CHART_LAYOUT_KEY, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHART_LAYOUT_KEY, onChange);
    window.removeEventListener('storage', onChange);
  };
}
const serverChartLayout = (): ChartLayout => 'medium';
const ratingPalette = ['#F26D6D', '#F2A65A', '#E8C547', '#A8E05F', '#7ED957'];

function AnswerList({ responses, testerNumbers, ratingsByTester, ratingQuestions }: {
  responses: Response[];
  testerNumbers: Map<string, string>;
  ratingsByTester: Map<string, Map<string, number>>;
  ratingQuestions: Question[];
}) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? responses : responses.slice(0, 4);
  return (
    <>
      <div className={css.answers} data-expanded={showAll}>
        {shown.map((r) => (
          <div key={r.id} className={css.answer}>
            <span className={css.answerId}>{r.testerId ? testerNumbers.get(r.testerId) ?? '#—' : '#—'}</span>
            <span className={css.answerText}>&ldquo;{r.rawAnswer}&rdquo;</span>
            <span className={css.answerRatings}>
              {ratingQuestions.map((question) => {
                const value = r.testerId ? ratingsByTester.get(r.testerId)?.get(question.id) : undefined;
                if (value === undefined) return null;
                const colorIndex = Math.max(0, Math.min(4, Math.round((value - 1) / ((question.type === 'rating_1_10' ? 10 : 5) - 1) * 4)));
                const color = ratingPalette[question.isInverseScored ? 4 - colorIndex : colorIndex];
                return <span key={question.id} className={css.ratingSquare}
                  style={{ backgroundColor: `${color}44` }} title={`${question.text}: ${value}`}>
                  {value}
                </span>;
              })}
            </span>
          </div>
        ))}
      </div>
      {responses.length > 4 && (
        <button type="button" className={css.showAll} onClick={() => setShowAll((value) => !value)}
          aria-expanded={showAll}>
          {showAll ? 'Show less' : `Show all ${responses.length}`}
        </button>
      )}
    </>
  );
}

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
  const chartLayout = useSyncExternalStore(subscribeChartLayout, readChartLayout, serverChartLayout);
  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false);
  const layoutControlRef = useRef<HTMLDivElement>(null);
  const layoutTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!layoutMenuOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!layoutControlRef.current?.contains(event.target as Node)) setLayoutMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setLayoutMenuOpen(false);
        layoutTriggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [layoutMenuOpen]);

  const selectChartLayout = (layout: ChartLayout) => {
    try { sessionStorage.setItem(CHART_LAYOUT_KEY, layout); } catch { /* storage blocked */ }
    window.dispatchEvent(new Event(CHART_LAYOUT_KEY));
    setLayoutMenuOpen(false);
    layoutTriggerRef.current?.focus();
  };

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
  const scoredResponses = categoryScoringResponses(catQuestions, catResponses);
  const categoryScore = scoredResponses.length > 0
    ? Math.round(scoredResponses.reduce((sum, r) => sum + (r.normalizedScore ?? 0), 0) / scoredResponses.length)
    : null;

  if (!category) {
    return (
      <div className="px-4 md:px-6 lg:px-8 py-8">
        <div className="text-slate-400 text-sm">Category not found.</div>
      </div>
    );
  }

  // Questionnaire order, so a follow-up ("If not, please explain why.") sits
  // right after the question it follows up. Consecutive charts share one grid,
  // and every chart still drives the cross-filter for the answers around it.
  const isChoiceType = (t: Question['type']) => t === 'yes_no' || t === 'multiple_choice';
  const isChart = (q: Question) => isRatingType(q.type) || isChoiceType(q.type) || q.type === 'duration';
  const ratingQuestions = catQuestions.filter((q) => isRatingType(q.type));
  const chartCount = catQuestions.filter(isChart).length;
  const runs: { chart: boolean; questions: Question[] }[] = [];
  for (const q of catQuestions) {
    const last = runs[runs.length - 1];
    if (last && last.chart === isChart(q)) last.questions.push(q);
    else runs.push({ chart: isChart(q), questions: [q] });
  }
  const testerNumbers = new Map(testers.map((tester, index) => [tester.id, `#${String(index + 1).padStart(2, '0')}`]));
  const ratingQuestionIds = new Set(ratingQuestions.map((q) => q.id));
  const ratingsByTester = new Map<string, Map<string, number>>();
  for (const response of responses) {
    if (!response.testerId || response.numericValue === null || !ratingQuestionIds.has(response.questionId)) continue;
    const ratings = ratingsByTester.get(response.testerId) ?? new Map<string, number>();
    ratings.set(response.questionId, response.numericValue);
    ratingsByTester.set(response.testerId, ratings);
  }

  const renderChart = (q: Question) => {
    // Own chart shows the full distribution among testers matching the
    // *other* drill filters (exclude self), with the selected bar lit.
    const ownResponses = responses.filter((r) => r.questionId === q.id);
    const visible = applyDrill(ownResponses, q.id);
    const isChoice = isChoiceType(q.type);
    const ratingResps = visible.filter((r) => r.numericValue !== null);
    const dist = !isChoice && ratingResps.length > 0
      ? computeRatingDistribution(ratingResps, q.type === 'rating_1_10' ? 10 : 5)
      : null;
    // Duration answers are minutes, charted as the Time Played filter's bands.
    const minutes = q.type === 'duration'
      ? visible.flatMap((r) => { const m = parseDurationMinutes(r.rawAnswer); return m === null ? [] : [m]; })
      : [];
    const choiceDist = isChoice && visible.some((r) => r.rawAnswer.trim())
      ? computeChoiceDistribution(visible, ownResponses, q.options)
      : minutes.length ? durationDistribution(visible) : null;
    const avgMinutes = minutes.length ? minutes.reduce((s, m) => s + m, 0) / minutes.length : null;
    const scored = visible.filter((r) => r.normalizedScore !== null);
    const avgNorm = scored.length
      ? Math.round(scored.reduce((s, r) => s + (r.normalizedScore ?? 0), 0) / scored.length)
      : null;

    return (
      <div key={q.id} className={css.ratingItem}>
        {/* Below `sm` this unstacks into three rows — question, score,
              actions — because all of it side by side either overflowed
              the card or crowded the score against the buttons. From `sm`
              it is the original single row. */}
        <div className={css.questionHeader}>
          <div className="flex items-start gap-2 flex-1 min-w-0">
            <div className="min-w-0">
              <p className={css.questionText}>{q.text}</p>
              <div className="flex items-center gap-2 mt-1.5">
                {(isChoice || q.type === 'duration') && <span className={css.questionType}>{questionTypeLabel(q.type)}</span>}
                <span className={css.questionMeta}>{q.type === 'duration' ? minutes.length : visible.length} responses</span>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3 sm:flex-shrink-0">
            {avgNorm !== null && (
              // One baseline row on a phone, stacked over its label from
              // `sm` — a full line for a two-digit score is dead space.
              <div className="flex items-baseline gap-1.5 sm:block sm:text-right">
                <div className={css.questionScore} style={{ color: scoreBandColor(avgNorm) }}>{avgNorm}</div>
                <div className={css.questionScoreUnit}>/ 100 avg</div>
              </div>
            )}
            {avgMinutes !== null && (
              <div className="flex items-baseline gap-1.5 sm:block sm:text-right">
                <div className={css.questionScore}>{formatDurationMinutes(avgMinutes)}</div>
                <div className={css.questionScoreUnit}>avg played</div>
              </div>
            )}
            <div className="flex items-center gap-2 sm:gap-3">
              <Link
                href={`/questions/${q.id}`}
                className={css.actionLink}
              >
                Detail →
              </Link>
            </div>
          </div>
        </div>

        {dist ? (
          <div className="mt-auto">
            <RatingBarChart
              data={dist}
              scale={q.type === 'rating_1_10' ? 10 : 5}
              palette={q.type === 'rating_1_5' ? ratingPalette : undefined}
              isInverseScored={q.isInverseScored}
              selectedValues={numericDrillValues(drill[q.id])}
              onBarClick={(val) => toggleDrill(q.id, val)} // was: openDrawer(q.id, val)
            />
          </div>
        ) : choiceDist ? (
          <div className="mt-auto">
            <div className="text-[10px] text-slate-500 mb-2 uppercase tracking-wide">
              Answer breakdown (click a bar to cross-filter)
            </div>
            <ChoiceBarChart
              data={choiceDist}
              selectedValues={(drill[q.id] ?? []).filter((v): v is string => typeof v === 'string')}
              onBarClick={(label) => toggleDrill(q.id, label)}
            />
          </div>
        ) : (
          <div className="mt-auto text-xs text-slate-500 italic py-4 text-center">
            No responses match the current selection.
          </div>
        )}
      </div>
    );
  };

  const renderProse = (q: Question) => {
    const visible = applyDrill(responses.filter((r) => r.questionId === q.id));
    const proseResponses = q.type === 'free_text'
      ? visible.filter((r) => r.numericValue === null && r.rawAnswer)
      : visible.filter((r) => r.rawAnswer.trim());

    return (
      <div key={q.id} className={`${css.questionItem} ${css.proseItem}`}>
        <div className={css.prosePrompt}>
          <div className="min-w-0">
            <div className={css.proseEyebrow}>{q.description?.trim() || questionTypeLabel(q.type)}</div>
            <p className={css.questionText}>
              {q.type === 'free_text'
                ? <Link href={`/questions/${q.id}`} className={css.questionLink}>{q.text}</Link>
                : q.text}
            </p>
            <div className={css.proseCount}>{proseResponses.length} answers</div>
          </div>
          <div className={css.proseActions}>
            {q.type === 'free_text' && <button
              onClick={() => setSummaryQ(q)}
              className={css.actionLink}
            >
              <Sparkles className="w-3.5 h-3.5" /> Summarise
            </button>}
            {q.type !== 'free_text' && <Link
              href={`/questions/${q.id}`}
              className={css.actionLink}
            >
              Detail →
            </Link>}
          </div>
        </div>

        <div className={css.proseAnswers}>
          {proseResponses.length > 0 ? (
            <AnswerList responses={proseResponses} testerNumbers={testerNumbers}
              ratingsByTester={ratingsByTester} ratingQuestions={ratingQuestions} />
          ) : (
            <div className={css.emptyAnswers}>
              {drillActive ? 'No responses match the current selection.' : 'No responses yet.'}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className={css.page}>
      <header className={`${css.header} groove-b`}>
        <div className={css.headerText}>
          <Link href="/categories" className={css.breadcrumb}>PLAYLYTIX / CATEGORIES</Link>
          <h1 className={css.title}>{category.name}</h1>
          <p className={css.meta}>
            {catQuestions.filter((q) => isRatingType(q.type)).length} rated questions ·{' '}
            {catQuestions.filter((q) => q.type === 'free_text').length} written ·{' '}
            {countRespondents(catResponses)} respondents
          </p>
        </div>
        <div className={css.scoreBlock}>
          <div className={css.scoreLabel}>Category score{filtersActive || drillActive ? ' · selected testers' : ''}</div>
          <div className={css.scoreValue} style={{ color: categoryScore === null ? undefined : scoreBandColor(categoryScore) }}>
            {categoryScore ?? '—'}<span className={css.scoreUnit}>/100</span>
          </div>
        </div>
      </header>

      {/* Themes for this category */}
      {catThemes.length > 0 && (
        <section className={css.section}>
          <h2 className={css.sectionTitle}>KEY THEMES</h2>
          <div className={css.themes}>
            {catThemes.map((t) => (
              <Link key={t.id} href={`/themes?theme=${encodeURIComponent(t.id)}`} className={css.themeLink}>
                  <span>{t.label}</span>
                  <span className={css.themeFrequency}>{t.frequency}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* The active cross-filter chips are rendered once by `DashboardShell`
          (see `components/filters/CrossFilterBar.tsx`), so they stay on screen
          across every page rather than only this one. */}

      {catQuestions.length > 0 && (
        <section className={css.section}>
          <div className={css.sectionHeader}>
            <h2 className={css.sectionTitle}>QUESTIONS</h2>
            <span className={css.sectionCount}>{catQuestions.length} questions</span>
            <span className={css.headerSpacer} />
            {chartCount > 0 && <div className={css.layoutControl} ref={layoutControlRef}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setLayoutMenuOpen(false);
              }}>
              <button ref={layoutTriggerRef} type="button" className={css.iconButton}
                aria-label={`Chart layout: ${chartLayout}`} aria-expanded={layoutMenuOpen}
                aria-controls="category-layout-menu" onClick={() => setLayoutMenuOpen((open) => !open)}>
                <LayoutGrid size={17} aria-hidden="true" />
                <span className={css.tooltip} aria-hidden="true">Chart layout</span>
              </button>
              {layoutMenuOpen && (
                <div id="category-layout-menu" className={css.layoutMenu} aria-label="Chart layout options">
                  {(['large', 'medium', 'small'] as const).map((layout) => (
                    <button key={layout} type="button" aria-pressed={chartLayout === layout}
                      className={css.layoutOption} onClick={() => selectChartLayout(layout)}>
                      <span className={css.layoutGlyph} aria-hidden="true">
                        {Array.from({ length: layout === 'large' ? 1 : layout === 'medium' ? 2 : 3 }, (_, index) => (
                          <span key={index} />
                        ))}
                      </span>
                      {layout[0].toUpperCase() + layout.slice(1)}
                    </button>
                  ))}
                </div>
              )}
            </div>}
          </div>
          {chartCount > 0 && <p className={css.sectionHint}>Click a bar to filter every other question, written answers included, down to those testers.</p>}
          {runs.map((run) => run.chart ? (
            <div key={run.questions[0].id} className={css.ratingGrid} data-layout={chartLayout}>
              {run.questions.map(renderChart)}
            </div>
          ) : (
            <div key={run.questions[0].id} className={css.questionList}>
              {run.questions.map(renderProse)}
            </div>
          ))}
        </section>
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
      {summaryQ?.type === 'free_text' && (
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
