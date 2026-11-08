'use client';
import { useCallback, useMemo } from 'react';
import { Users, ListOrdered, MessageSquareText, Sparkles, RefreshCw, Loader2, Lightbulb, X, UserRound, ChevronRight } from 'lucide-react';
import { useDashboardStore, selectAnyFilterActive, selectSegmentFilteredResponses } from '@/lib/store';
import type { QuestionAnalysisResult } from '@/app/api/question-analysis/route';
import type { Question, Response, Tester } from '@/lib/types';
import { applyDrill, buildPerQuestionSets, matchingTesterIds } from '@/lib/crossFilter';
import { buildRankingContext, computeRanking, ordinal, parseRankDrillValue, type RankingContext, type RankingResult } from '@/lib/ranking';
import { countRespondents } from '@/lib/responseStats';
import { formatTesterLabel } from '@/lib/utils';
import { useCachedAnalysis } from '@/lib/useCachedAnalysis';
import CompanyLogo from '@/components/brand/CompanyLogo';
import RankingBars from '@/components/charts/RankingBars';
import OptionInsights from '@/components/overview/OptionInsights';

/** Below this gap in average place, the top two are reported as a close race. */
const CLOSE_RACE = 0.5;
/** Share of first *and* of last places at which an item is said to split opinion. */
const SPLIT_SHARE = 20;

const card = 'rounded-2xl border border-slate-700/60 bg-slate-800/20 p-5 mb-6';

/**
 * Overview for a ranking study ("put these trailers in order, then tell us
 * why"). It leads with the ranking result and follows with the reasons, which
 * the AI reads alongside each tester's own order.
 */
export default function RankingOverview() {
  const project = useDashboardStore((s) => s.project);
  const questions = useDashboardStore((s) => s.questions);
  const testers = useDashboardStore((s) => s.testers);
  // Segment-filtered only; each ranking chart applies the cross-filter itself
  // with its own selection excluded, so every cell stays clickable.
  const responses = useDashboardStore(selectSegmentFilteredResponses);
  const drill = useDashboardStore((s) => s.drill);
  const toggleDrill = useDashboardStore((s) => s.toggleDrillValue);
  const clearDrillQuestion = useDashboardStore((s) => s.clearDrillQuestion);
  const filtersActive = useDashboardStore(selectAnyFilterActive);

  const rankingQuestions = questions.filter((q) => q.type === 'ranking');
  const textQuestions = questions.filter((q) => q.type === 'free_text');

  const perQuestionSets = useMemo(() => buildPerQuestionSets(responses, drill), [responses, drill]);
  const cohort = useMemo(() => applyDrill(responses, matchingTesterIds(perQuestionSets)), [responses, perQuestionSets]);
  const rankingContext = useMemo(() => buildRankingContext(questions, responses), [questions, responses]);

  const rankings = rankingQuestions.map((q) => {
    const own = applyDrill(responses.filter((r) => r.questionId === q.id), matchingTesterIds(perQuestionSets, q.id));
    return { q, result: computeRanking(q, own) };
  });
  const itemOrder = rankings[0]?.result.items.map((i) => i.name);

  if (!project) return null;
  const participants = countRespondents(cohort);
  const times = cohort.map((r) => Date.parse(r.submittedAt)).filter(Number.isFinite);
  const range = times.length ? formatRange(new Date(Math.min(...times)), new Date(Math.max(...times))) : null;

  return (
    <div className="min-h-screen mx-auto w-full max-w-[1280px] px-4 md:px-6 lg:px-8 py-10">
      <div className="mb-8">
        <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1">Ranking test</div>
        <div className="flex items-center gap-3">
          <CompanyLogo className="w-12" priority />
          <h1 className="text-2xl sm:text-[2rem] font-bold text-white tracking-tight leading-tight">{project.gameName || project.name}</h1>
        </div>
        <div className="flex items-center gap-3 mt-3 flex-wrap text-sm text-slate-400">
          <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-slate-500" />{participants} testers</span>
          {range && <><span className="text-slate-700">·</span><span>{range}</span></>}
        </div>
      </div>

      {rankings.map(({ q, result }) => {
        const selected = (drill[q.id] ?? []).filter((v): v is string => typeof v === 'string');
        return (
          <section key={q.id} className={card}>
            <div className="flex items-start gap-2 mb-1">
              <ListOrdered className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
              <h2 className="text-sm font-semibold text-white leading-snug">{q.text}</h2>
            </div>
            {result.n === 0 ? (
              <p className="text-sm text-slate-500 py-6 text-center">No rankings match the current selection.</p>
            ) : (
              <>
                <RankingStory result={result} />
                <RankingBars result={result} selectedValues={selected} onCellClick={(v) => toggleDrill(q.id, v)} />
                <div className="flex flex-wrap items-center justify-between gap-2 mt-3 text-[11px] text-slate-500">
                  <span>Based on {result.n} {result.n === 1 ? 'ranking' : 'rankings'}. Click part of the chart to read only those testers&apos; reasons below.</span>
                  {selected.length > 0 && (
                    <button onClick={() => clearDrillQuestion(q.id)} className="flex items-center gap-1 text-indigo-300 hover:text-white">
                      <X className="w-3 h-3" /> Showing {selected.map(describeCell).join(' or ')}
                    </button>
                  )}
                </div>
              </>
            )}
          </section>
        );
      })}

      {textQuestions.map((q) => (
        <WhyCard
          key={q.id}
          question={q}
          responses={cohort.filter((r) => r.questionId === q.id && r.rawAnswer.trim().length > 3)}
          testers={testers}
          rankingContext={rankingContext}
          itemOrder={itemOrder}
          filtersActive={filtersActive}
        />
      ))}
    </div>
  );
}

const describeCell = (value: string) => {
  const cell = parseRankDrillValue(value);
  return cell ? `${cell.item} in ${ordinal(cell.place)}` : value;
};

/** The ranking result in plain sentences: who leads, how clearly, and what splits opinion. */
function RankingStory({ result }: { result: RankingResult }) {
  const ranked = result.items.filter((i) => i.avgPlace !== null);
  const [first, second] = ranked;
  const last = ranked[ranked.length - 1];
  if (!first) return null;
  const lastPlace = result.places - 1;
  const mostFirsts = [...ranked].sort((a, b) => b.counts[0] - a.counts[0])[0];
  const split = ranked.filter((i) => i.pcts[0] >= SPLIT_SHARE && i.pcts[lastPlace] >= SPLIT_SHARE);
  const b = (text: string) => <strong className="text-white font-semibold">{text}</strong>;
  return (
    <ul className="text-sm text-slate-300 leading-relaxed mb-4 space-y-1 list-disc pl-5 marker:text-slate-600">
      <li>
        {b(first.name)} leads with an average place of {first.avgPlace!.toFixed(1)}, ranked 1st by {first.counts[0]} of {result.n} testers ({first.pcts[0]}%).
      </li>
      {mostFirsts !== first && mostFirsts.counts[0] > first.counts[0] && (
        <li>{b(mostFirsts.name)} has the most 1st places ({mostFirsts.counts[0]}) but ranks lower overall.</li>
      )}
      {second && second.avgPlace! - first.avgPlace! < CLOSE_RACE && (
        <li>
          {b(second.name)} is close behind ({second.avgPlace!.toFixed(1)}). With {result.n} rankings the top two are not clearly separated.
        </li>
      )}
      {split.map((i) => (
        <li key={i.name}>{b(i.name)} splits opinion: {i.counts[0]} testers put it 1st and {i.counts[lastPlace]} put it last.</li>
      ))}
      {last && last !== first && (
        <li>{b(last.name)} comes last on average ({last.avgPlace!.toFixed(1)}), ranked last by {last.counts[lastPlace]} of {result.n} testers.</li>
      )}
    </ul>
  );
}

/** A free-text question: the AI summary of the reasons, then every answer beside the tester's own order. */
function WhyCard({ question, responses, testers, rankingContext, itemOrder, filtersActive }: {
  question: Question;
  responses: Response[];
  testers: Tester[];
  rankingContext?: RankingContext;
  itemOrder?: string[];
  filtersActive: boolean;
}) {
  const openTesterPanel = useDashboardStore((s) => s.openTesterPanel);
  const testerById = useMemo(() => new Map(testers.map((t) => [t.id, t])), [testers]);

  const payload = useMemo(() => {
    const ids = new Set(responses.flatMap((r) => (r.testerId ? [r.testerId] : [])));
    const byTester = rankingContext
      ? Object.fromEntries(Object.entries(rankingContext.byTester).filter(([id]) => ids.has(id)))
      : {};
    return {
      question,
      responses,
      testers: testers.filter((t) => ids.has(t.id)),
      rankingContext: rankingContext && Object.keys(byTester).length ? { ...rankingContext, byTester } : undefined,
    };
  }, [question, responses, testers, rankingContext]);

  const signature = useMemo(() => (responses.length
    ? JSON.stringify([question.id, responses.map((r) => [r.id, r.rawAnswer]), payload.rankingContext?.byTester ?? null])
    : ''), [question.id, responses, payload.rankingContext]);

  const fetcher = useCallback(async (): Promise<QuestionAnalysisResult> => {
    const res = await fetch('/api/question-analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    if (!res.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
    return body as QuestionAnalysisResult;
  }, [payload]);

  // As on the other overviews: the full set analyses itself, a filtered cohort is asked for.
  const { data, loading, error, run } = useCachedAnalysis<QuestionAnalysisResult>({
    key: `questionAnalysis:${question.id}`,
    signature,
    auto: !filtersActive,
    fetcher,
  });

  return (
    <section className={card}>
      <div className="flex items-start gap-2 mb-1">
        <MessageSquareText className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
        <h2 className="text-sm font-semibold text-white leading-snug flex-1">{question.text}</h2>
        {data && !loading && (
          <button onClick={run} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-indigo-600/20 border border-indigo-500/40 text-indigo-300 hover:bg-indigo-600/30 transition-colors flex-shrink-0">
            <RefreshCw className="w-3 h-3" /> Re-run
          </button>
        )}
      </div>
      {question.description && <p className="text-xs text-slate-500 mb-4 ml-6">{question.description}</p>}

      {responses.length === 0 ? (
        <p className="text-sm text-slate-500 py-6 text-center">No answers match the current selection.</p>
      ) : (
        <>
          <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4 mb-5">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <span className="text-xs font-semibold uppercase tracking-wide text-indigo-200">AI summary</span>
              <span className="text-[11px] text-slate-500">of {responses.length} answers</span>
            </div>
            {loading && (
              <div className="flex items-center gap-2 py-4 text-sm text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin" /> Reading {responses.length} answers…
              </div>
            )}
            {!loading && error && (
              <div className="flex flex-wrap items-center gap-3 text-sm text-red-300">
                {error}
                <button onClick={run} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white">
                  <RefreshCw className="w-3.5 h-3.5" /> Retry
                </button>
              </div>
            )}
            {!loading && !error && !data && (
              <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
                Summarise the {responses.length} answers from the current filter?
                <button onClick={run} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white">
                  <Sparkles className="w-3.5 h-3.5" /> Summarise
                </button>
              </div>
            )}
            {!loading && data && (
              <div className="space-y-4">
                <p className="text-sm text-slate-200 leading-relaxed">{data.summary}</p>
                {data.optionInsights && <OptionInsights insights={data.optionInsights} order={itemOrder} />}
                {data.themes.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {data.themes.map((t) => (
                      <div key={t.label} className="rounded-lg bg-slate-900/50 border border-slate-700/40 px-3 py-2 max-w-md">
                        <div className="text-xs font-semibold text-indigo-300">{t.label}</div>
                        <div className="text-xs text-slate-400 leading-relaxed">{t.insight}</div>
                      </div>
                    ))}
                  </div>
                )}
                {data.actionable && (
                  <div className="flex gap-2.5 text-xs text-slate-300 leading-relaxed">
                    <Lightbulb className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0 mt-0.5" />
                    <span><span className="font-semibold text-indigo-300">Recommendation: </span>{data.actionable}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">All answers</div>
          <div className="space-y-2 max-h-[720px] overflow-y-auto pr-1">
            {responses.map((r) => {
              const tester = r.testerId ? testerById.get(r.testerId) : undefined;
              const order = r.testerId ? rankingContext?.byTester[r.testerId] : undefined;
              return (
                <article key={r.id} className="rounded-lg border border-slate-700/40 bg-slate-900/30 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-2">
                    {tester ? (
                      <button
                        type="button"
                        onClick={() => openTesterPanel(tester.id)}
                        title="Open this tester's profile"
                        className="group inline-flex items-center gap-1.5 cursor-pointer rounded-md border border-slate-600/70 bg-slate-800/60 pl-1.5 pr-1 py-0.5 text-xs font-semibold text-slate-200 transition-colors hover:border-cyan-400/60 hover:bg-slate-800 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
                      >
                        <UserRound className="w-3.5 h-3.5 text-slate-400 group-hover:text-cyan-300" aria-hidden />
                        {formatTesterLabel(tester)}
                        <ChevronRight className="w-3.5 h-3.5 text-slate-500 transition-transform group-hover:translate-x-0.5 group-hover:text-cyan-300" aria-hidden />
                      </button>
                    ) : <span className="text-xs text-slate-500">Unknown tester</span>}
                    {order && (
                      <ol className="flex flex-wrap gap-1" aria-label="This tester's ranking">
                        {order.map((name, i) => (
                          <li key={name} className="text-[11px] rounded bg-slate-800 text-slate-300 px-1.5 py-0.5">
                            <span className="font-mono text-cyan-300">{i + 1}</span> {name}
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                  <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line break-words">{r.rawAnswer.trim()}</p>
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

function formatRange(start: Date, end: Date): string {
  const full = (x: Date) => x.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  if (start.toDateString() === end.toDateString()) return full(start);
  if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) return `${start.getDate()}–${full(end)}`;
  return `${full(start)} – ${full(end)}`;
}
