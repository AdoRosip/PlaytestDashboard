'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Users, Star, TrendingUp, ThumbsUp,
  ArrowRight, ChevronRight, Brain,
  AlertTriangle, Clock, Download, Flag,
  BookOpen, Info, Trophy, Split,
  Sparkles, Lightbulb, RefreshCw,
} from 'lucide-react';
import { useDashboardStore, selectFilteredResponses, selectFilteredTesters } from '@/lib/store';
import type { Question, Severity } from '@/lib/types';
import type { FlawRecommendationsResult } from '@/app/api/flaw-recommendations/route';
import { countRespondents } from '@/lib/responseStats';
import CompanyLogo from '@/components/brand/CompanyLogo';
import CategoryGaugeRow from '@/components/charts/CategoryGaugeRow';
import QuestionHighlights from '@/components/charts/QuestionHighlights';
import PlayerDemoWidget from '@/components/ui/PlayerDemoWidget';

// ─────────────────────────────────────────────────────────────────────────────
// Shared micro-components
// ─────────────────────────────────────────────────────────────────────────────

const SEV: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  Critical: { bg: 'bg-red-500/10',     text: 'text-red-400',     border: 'border-red-500/30',    dot: 'bg-red-500'    },
  High:     { bg: 'bg-orange-500/10',  text: 'text-orange-400',  border: 'border-orange-500/30', dot: 'bg-orange-500' },
  Medium:   { bg: 'bg-amber-500/10',   text: 'text-amber-400',   border: 'border-amber-500/30',  dot: 'bg-amber-400'  },
  Low:      { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30',dot: 'bg-emerald-500'},
};

function SevBadge({ sev }: { sev: string }) {
  const c = SEV[sev] ?? SEV.Medium;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${c.bg} ${c.text} ${c.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {sev}
    </span>
  );
}

function SectionLabel({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-5">
      <div className="flex items-center gap-3">
        <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">{children}</span>
        <div className="w-16 h-px bg-slate-700" />
      </div>
      {action && <div className="text-xs text-slate-400">{action}</div>}
    </div>
  );
}

function InfoTooltip({ text }: { text: string }) {
  return (
    <div className="relative group ml-auto flex-shrink-0">
      <Info className="w-3 h-3 text-slate-600 hover:text-slate-400 cursor-help transition-colors" />
      <div className="absolute bottom-full right-0 mb-2 w-56 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-[11px] text-slate-300 leading-relaxed shadow-xl invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-150 z-50 pointer-events-none">
        {text}
        <span className="absolute top-full right-2 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-slate-700" />
      </div>
    </div>
  );
}

function formatHours(hours: number | null): string {
  if (hours === null) return '—';
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 10) {
    const whole = Math.floor(hours);
    const minutes = Math.round((hours - whole) * 60);
    return minutes > 0 ? `${whole}h ${minutes}m` : `${whole}h`;
  }
  return `${Math.round(hours)}h`;
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

function formatTier(value: number | null): string {
  if (value === null) return '—';
  const formatted = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `Tier ${formatted}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function OverviewPage() {
  const project    = useDashboardStore(s => s.project);
  const questions  = useDashboardStore(s => s.questions);
  const responses  = useDashboardStore(selectFilteredResponses);
  const categories = useDashboardStore(s => s.categories);
  const testers    = useDashboardStore(selectFilteredTesters);
  const themes     = useDashboardStore(s => s.themes);

  const d = useMemo(() => {
    // ── helpers ────────────────────────────────────────────────────────────
    const catStats = (catId: string) => {
      const qIds = new Set(questions.filter(q => q.categoryId === catId).map(q => q.id));
      const vals = responses.filter(r => qIds.has(r.questionId) && r.normalizedScore !== null).map(r => r.normalizedScore!);
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
        positive: p(pos), neutral: p(rs.length - pos - neg), negative: p(neg), n: rs.length, max,
      };
    };

    // ── Playtime stats ─────────────────────────────────────────────────────
    const playtimeQ = questions.find(q =>
      !/factorio|satisfactory/i.test(q.text) &&
      /(?:how many|approximately|approx|total)?.*(?:hours|playtime|play time|time played).*(?:play|played|game|session)?|session.*(?:duration|length)/i.test(q.text)
    );
    const playtimeValues = playtimeQ
      ? responses
          .filter(r => r.questionId === playtimeQ.id)
          .flatMap(r => {
            const hours = parsePlaytimeHours(r.rawAnswer, r.numericValue);
            return hours !== null ? [hours] : [];
          })
      : [];
    const avgPlaytime = playtimeValues.length
      ? playtimeValues.reduce((a, b) => a + b, 0) / playtimeValues.length
      : null;
    const totalPlaytime = playtimeValues.length
      ? playtimeValues.reduce((a, b) => a + b, 0)
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

    const allNorm = responses.filter(r => r.normalizedScore !== null).map(r => r.normalizedScore!);
    const overallScore = allNorm.length
      ? Math.round(allNorm.reduce((a, b) => a + b, 0) / allNorm.length)
      : null;

    // ── KPI questions ──────────────────────────────────────────────────────
    const q = (pat: RegExp): Question | undefined => questions.find(q => pat.test(q.text));
    const enjoyQ   = q(/enjoy.*overall|overall.*enjoy/i);
    const clarityQ = q(/game.?mechanic.*overall|how.*intuitive/i);
    const retQ     = q(/continue.*playing/i);
    const npsQ     = q(/recommend.*friend/i);

    // Use each question's detected scale (falls back to a sensible default if the
    // parser didn't record one) instead of assuming a fixed 5- or 10-point scale.
    const scaleOf = (qq: Question | undefined, fallback: number) => qq?.scaleMax ?? fallback;
    const enjoyStats   = enjoyQ   ? qSentiment(enjoyQ.id,   scaleOf(enjoyQ,   5)) : null;
    const clarityStats = clarityQ ? qSentiment(clarityQ.id, scaleOf(clarityQ, 5)) : null;
    const retStats     = retQ     ? qSentiment(retQ.id,     scaleOf(retQ,    10)) : null;
    const npsStats     = npsQ     ? qSentiment(npsQ.id,     scaleOf(npsQ,    10)) : null;

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
      .filter(c => !/admin|internal|evidence|background|recording/i.test(c.name))
      .flatMap(c => { const s = catStats(c.id); return s ? [{ ...c, avg: s.avg, n: s.n }] : []; })
      .sort((a, b) => b.avg - a.avg);

    // ── Biggest flaws: the worst-scoring areas + their evidence ────────────
    // The lowest 3 categories, richest first, carrying the themes and the
    // representative negative quotes the AI recommendation endpoint needs.
    const flaws = [...catScores].slice(-3).reverse().map(c => {
      const qIds = new Set(questions.filter(q => q.categoryId === c.id).map(q => q.id));
      const rVals = responses.filter(r => qIds.has(r.questionId) && r.normalizedScore !== null);
      const negativePct = rVals.length
        ? Math.round((rVals.filter(r => r.normalizedScore! < 40).length / rVals.length) * 100)
        : 0;
      const catThemes = themes.filter(t => t.categoryId === c.id);
      // Quotes the testers actually wrote: theme exemplars first, then any
      // substantive free-text answers in this category. Deduped, capped at 4.
      const themeQuotes = catThemes.flatMap(t => t.representativeQuotes ?? []);
      const freeTextQuotes = responses
        .filter(r =>
          qIds.has(r.questionId) && r.numericValue === null &&
          r.rawAnswer.trim().length >= 30 && r.rawAnswer.trim().length <= 220)
        .map(r => r.rawAnswer.trim());
      const quotes = [...new Set([...themeQuotes, ...freeTextQuotes])].slice(0, 4);
      return {
        id: c.id,
        title: c.name,
        score: Math.round(c.avg),
        n: c.n,
        negativePct,
        themes: catThemes.map(t => ({
          label: t.label,
          summary: t.summary,
          severity: t.severity as Severity,
        })),
        quotes,
      };
    });

    // ── Segment insights ───────────────────────────────────────────────────
    const tMap = new Map(testers.map(t => [t.id, t]));
    const globalAvg = allNorm.length ? allNorm.reduce((a, b) => a + b, 0) / allNorm.length : 0;

    // Per-group average normalized score for one segment dimension. Only groups
    // with at least 3 rating responses are kept so a single tester can't define
    // a segment.
    const segGroups = (key: 'gamer_type' | 'age_group' | 'hardware_tier') => {
      const groups = new Map<string, number[]>();
      for (const r of responses) {
        if (r.normalizedScore === null || !r.testerId) continue;
        const raw = tMap.get(r.testerId)?.segments[key];
        if (!raw) continue;
        const label = raw.split(',')[0].trim();
        const arr = groups.get(label) ?? []; arr.push(r.normalizedScore); groups.set(label, arr);
      }
      const stats: { label: string; avg: number; n: number }[] = [];
      for (const [label, sc] of groups) {
        if (sc.length < 3) continue;
        stats.push({ label, avg: sc.reduce((a, b) => a + b, 0) / sc.length, n: sc.length });
      }
      return stats;
    };

    const SEG_DIMS = [
      { key: 'gamer_type'   as const, label: 'Gamer Type'    },
      { key: 'age_group'    as const, label: 'Age Group'     },
      { key: 'hardware_tier' as const, label: 'Hardware Tier' },
    ];
    const dimStats = SEG_DIMS.map(d => ({ ...d, groups: segGroups(d.key) }));

    // ── Struggling segments: a group scoring ≥7pts below global, one per dim ──
    const segmentCards = dimStats.flatMap(d => {
      const worst = d.groups.reduce<{ label: string; avg: number } | null>(
        (acc, g) => (!acc || g.avg < acc.avg ? g : acc), null);
      if (!worst || globalAvg - worst.avg < 7) return [];
      return [{
        dimension: d.label,
        worstLabel: worst.label,
        worstScore: Math.round(worst.avg),
        globalScore: Math.round(globalAvg),
        topArea: catScores.filter(c => c.avg < 55)[0]?.name ?? 'Multiple areas',
      }];
    });

    // ── Champions: the single highest-scoring group ≥5pts above global ───────
    // A gentler bar than the 7pt "struggling" threshold — a standout segment is
    // worth celebrating even when it isn't as far ahead as a problem group is behind.
    let champion: {
      dimension: string; label: string; score: number; globalScore: number;
    } | null = null;
    for (const d of dimStats) {
      for (const g of d.groups) {
        if (g.avg - globalAvg < 5) continue;
        if (!champion || g.avg > champion.score) {
          champion = {
            dimension: d.label, label: g.label,
            score: Math.round(g.avg), globalScore: Math.round(globalAvg),
          };
        }
      }
    }

    // ── Biggest divider: dimension with the widest best-vs-worst spread ──────
    let divider: {
      dimension: string; spread: number;
      hiLabel: string; hiScore: number; loLabel: string; loScore: number;
    } | null = null;
    for (const d of dimStats) {
      if (d.groups.length < 2) continue;
      const sorted = [...d.groups].sort((a, b) => b.avg - a.avg);
      const hi = sorted[0], lo = sorted[sorted.length - 1];
      const spread = hi.avg - lo.avg;
      if (spread < 10) continue;
      if (!divider || spread > divider.spread) {
        divider = {
          dimension: d.label, spread: Math.round(spread),
          hiLabel: hi.label, hiScore: Math.round(hi.avg),
          loLabel: lo.label, loScore: Math.round(lo.avg),
        };
      }
    }

    // ── Best & worst rated questions ───────────────────────────────────────
    // Average normalized score per rating question (excluding admin/internal).
    // Requires a small sample so a single answer can't top or bottom the list.
    const MIN_SAMPLE = 3;
    const questionScores = questions
      .filter(q => q.categoryId !== null && !/cat_15|admin|internal/i.test(q.categoryId))
      .map(q => {
        const rs = responses.filter(r => r.questionId === q.id && r.normalizedScore !== null);
        if (rs.length < MIN_SAMPLE) return null;
        const avg = Math.round(rs.reduce((s, r) => s + (r.normalizedScore ?? 0), 0) / rs.length);
        return { id: q.id, text: q.text, score: avg, n: rs.length };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.score - a.score);

    // Show up to 3 each, never letting the same question appear in both lists.
    const perSide = Math.min(3, Math.floor(questionScores.length / 2));
    const bestQuestions = questionScores.slice(0, perSide);
    const worstQuestions = questionScores.slice(questionScores.length - perSide).reverse();

    // ── Question count ─────────────────────────────────────────────────────
    const questionCount = questions.filter(q =>
      q.categoryId !== null &&
      !/cat_15|admin|internal/i.test(q.categoryId)
    ).length;

    // ── Date range ─────────────────────────────────────────────────────────
    const timestamps = responses
      .map(r => new Date(r.submittedAt).getTime())
      .filter(t => !isNaN(t));
    const dateRange = timestamps.length > 0 ? {
      start: new Date(Math.min(...timestamps)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      end:   new Date(Math.max(...timestamps)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    } : null;

    return {
      catScores,
      flaws,
      segmentCards,
      champion,
      divider,
      avgPlaytime,
      totalPlaytime,
      maxTier,
      maxTierCount,
      avgTier,
      tierN: progressValues.length,
      overallScore,
      enjoyStats,
      clarityStats,
      retStats,
      npsStats,
      tutorialPct,
      bestQuestions,
      worstQuestions,
      questionCount,
      dateRange,
    };
  }, [questions, responses, categories, testers, themes]);

  // ── AI recommendations for the biggest flaws (button-triggered) ───────────
  const [aiRecs,    setAiRecs]    = useState<FlawRecommendationsResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError,   setAiError]   = useState<string | null>(null);

  const runFlawRecs = async () => {
    if (d.flaws.length === 0) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch('/api/flaw-recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameName: project?.gameName || project?.name || '',
          flaws: d.flaws.map(f => ({
            area: f.title,
            score: f.score,
            negativePct: f.negativePct,
            themes: f.themes,
            quotes: f.quotes,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
      setAiRecs(data as FlawRecommendationsResult);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Failed to generate recommendations');
    } finally {
      setAiLoading(false);
    }
  };

  // Auto-generate recommendations once the flaws are known, and again whenever
  // the worst areas actually change (e.g. filters shift the bottom 3). The
  // signature guards against firing on unrelated re-renders / duplicate calls.
  const flawSignature = d.flaws.map(f => `${f.id}:${f.score}`).join('|');
  const lastRunSig = useRef<string | null>(null);
  useEffect(() => {
    if (!flawSignature || lastRunSig.current === flawSignature) return;
    lastRunSig.current = flawSignature;
    runFlawRecs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flawSignature]);

  if (!project) return null;

  const dateStr =new Date(project.createdAt).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const participantCount = countRespondents(responses);

  // ── Hero tile helpers ────────────────────────────────────────────────────
  const enjoyDisplay  = d.enjoyStats  ? `${d.enjoyStats.avg.toFixed(1)} / ${d.enjoyStats.max}`  : '—';
  const retPct        = d.retStats    ? `${Math.round(d.retStats.avg / d.retStats.max * 100)}%`   : '—';
  const npsPct        = d.npsStats    ? `${Math.round(d.npsStats.avg / d.npsStats.max * 100)}%`   : '—';
  const tutorialDisplay = d.tutorialPct !== null ? `${d.tutorialPct}%` : null;
  const progressionValue = formatTier(d.avgTier);
  const progressionSub = d.avgTier !== null
    ? `furthest ${formatTier(d.maxTier)} · n=${d.tierN}`
    : 'no progression question detected';

  return (
    <div className="min-h-screen mx-auto w-full max-w-[1680px] px-6 lg:px-8 py-10">

      {/* ── PAGE HEADER ──────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-10">
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
          <p className="text-base text-slate-400 mt-1.5">{project.playtestName}</p>
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            <span className="flex items-center gap-1.5 text-sm text-slate-400">
              <Users className="w-3.5 h-3.5 text-slate-500" />
              {participantCount} testers
            </span>
            {d.questionCount > 0 && (
              <>
                <span className="text-slate-700">·</span>
                <span className="text-sm text-slate-400">{d.questionCount} questions</span>
              </>
            )}
            {d.dateRange ? (
              <>
                <span className="text-slate-700">·</span>
                <span className="text-sm text-slate-400">
                  {d.dateRange.start === d.dateRange.end
                    ? d.dateRange.start
                    : `${d.dateRange.start} – ${d.dateRange.end}`}
                </span>
              </>
            ) : (
              <>
                <span className="text-slate-700">·</span>
                <span className="text-sm text-slate-400">{dateStr}</span>
              </>
            )}
            <span className="text-slate-700">·</span>
            <span className="flex items-center gap-1.5 text-sm text-slate-500">
              <CompanyLogo className="w-5" />
              Prepared by Playlytix
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <Link
            href="/export"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-slate-800/60 border border-slate-700 text-slate-300 hover:border-indigo-500/60 hover:text-indigo-300 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Download Full Report
          </Link>
          {d.overallScore !== null && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-900/20 border border-emerald-700/30 text-[10px] font-semibold text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              {d.overallScore >= 70 ? 'Excellent' : d.overallScore >= 50 ? 'Good' : 'Needs Attention'} · {d.overallScore}/100
            </div>
          )}
        </div>
      </div>

      {/* ── SECTION 1: HERO KPI TILES ────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7 gap-4 mb-10">

        {/* Overall Satisfaction */}
        <div className="bg-slate-800/30 rounded-2xl border border-slate-700/60 p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-slate-700/60 flex items-center justify-center">
              <Star className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <span className="text-xs font-medium text-slate-400 leading-tight">Overall Satisfaction</span>
            <InfoTooltip text="Average rating from the 'overall enjoyment' question (1–5 scale). Question matched automatically by keywords like 'enjoy overall'." />
          </div>
          <div className={`text-2xl font-bold ${d.enjoyStats ? 'text-[#00FFFF]' : 'text-slate-600'}`}>
            {enjoyDisplay}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            {d.enjoyStats ? `n=${d.enjoyStats.n} responses` : 'no enjoyment question detected'}
          </div>
        </div>

        {/* Continue Playing */}
        <div className="bg-slate-800/30 rounded-2xl border border-slate-700/60 p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-slate-700/60 flex items-center justify-center">
              <TrendingUp className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <span className="text-xs font-medium text-slate-400 leading-tight">Want to Continue Playing</span>
            <InfoTooltip text="Derived from the 'continue playing' question. Shown as a percentage of the question's max score. Matched by keywords like 'continue playing'." />
          </div>
          <div className={`text-2xl font-bold ${d.retStats ? 'text-[#00FFFF]' : 'text-slate-600'}`}>
            {retPct}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            {d.retStats ? `${d.retStats.avg.toFixed(1)} / ${d.retStats.max} avg score` : 'no retention question detected'}
          </div>
        </div>

        {/* Would Recommend */}
        <div className="bg-slate-800/30 rounded-2xl border border-slate-700/60 p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-slate-700/60 flex items-center justify-center">
              <ThumbsUp className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <span className="text-xs font-medium text-slate-400 leading-tight">Would Recommend</span>
            <InfoTooltip text="NPS-style metric from the 'recommend to a friend' question. Converted to a percentage of the question's max score. Matched by keywords like 'recommend friend'." />
          </div>
          <div className={`text-2xl font-bold ${d.npsStats ? 'text-[#00FFFF]' : 'text-slate-600'}`}>
            {npsPct}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            {d.npsStats ? `${d.npsStats.avg.toFixed(1)} / ${d.npsStats.max} avg score` : 'no recommendation question detected'}
          </div>
        </div>

        {/* Avg Playtime */}
        <div className="bg-slate-800/30 rounded-2xl border border-slate-700/60 p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-slate-700/60 flex items-center justify-center">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <span className="text-xs font-medium text-slate-400 leading-tight">Avg Playtime</span>
            <InfoTooltip text="Mean session length across all testers. Parsed from the playtime question — handles numeric hours, text like '1h 30m' or '90 minutes', and HH:MM clock format." />
          </div>
          <div className={`text-2xl font-bold ${d.avgPlaytime !== null ? 'text-[#00FFFF]' : 'text-slate-600'}`}>
            {formatHours(d.avgPlaytime)}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            {d.avgPlaytime !== null ? 'average session length' : 'no playtime data detected'}
          </div>
        </div>

        {/* Total Playtime */}
        <div className="bg-slate-800/30 rounded-2xl border border-slate-700/60 p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-slate-700/60 flex items-center justify-center">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <span className="text-xs font-medium text-slate-400 leading-tight">Total Playtime</span>
            <InfoTooltip text="Sum of all testers' session lengths. Parsed from the same playtime question as Avg Playtime." />
          </div>
          <div className={`text-2xl font-bold ${d.totalPlaytime !== null ? 'text-[#00FFFF]' : 'text-slate-600'}`}>
            {formatHours(d.totalPlaytime)}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            {d.totalPlaytime !== null ? 'combined across all testers' : 'no playtime data detected'}
          </div>
        </div>

        {/* Progression Reached */}
        <div className="bg-slate-800/30 rounded-2xl border border-slate-700/60 p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-slate-700/60 flex items-center justify-center">
              <Flag className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <span className="text-xs font-medium text-slate-400 leading-tight">Progression Reached</span>
            <InfoTooltip text="Average tier/level reached across testers, parsed from the progress question. Accepts numbers, Roman numerals, and word forms (e.g. 'reached Tier III'). Sub-label shows the single furthest tier hit by any tester." />
          </div>
          <div className={`text-2xl font-bold ${d.avgTier !== null ? 'text-[#00FFFF]' : 'text-slate-600'}`}>
            {progressionValue}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">{progressionSub}</div>
        </div>

        {/* Tutorial Completion — fallback to participant count */}
        {tutorialDisplay !== null ? (
          <div className="bg-slate-800/30 rounded-2xl border border-slate-700/60 p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-slate-700/60 flex items-center justify-center">
                <BookOpen className="w-3.5 h-3.5 text-slate-400" />
              </div>
              <span className="text-xs font-medium text-slate-400 leading-tight">Completed Tutorial</span>
              <InfoTooltip text="% of testers who answered yes / completed / done on a tutorial or onboarding question (yes-no or multiple-choice type). Matched by keywords like 'tutorial' or 'onboarding'." />
            </div>
            <div className="text-2xl font-bold text-[#00FFFF]">{tutorialDisplay}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">of testers finished tutorial</div>
          </div>
        ) : (
          <Link
            href="/testers"
            className="bg-slate-800/30 rounded-2xl border border-slate-700/60 p-5 hover:border-indigo-500/50 hover:bg-slate-800/50 transition-colors"
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-slate-700/60 flex items-center justify-center">
                <Users className="w-3.5 h-3.5 text-slate-400" />
              </div>
              <span className="text-xs font-medium text-slate-400 leading-tight">Tests Completed</span>
              <InfoTooltip text="Number of unique testers with at least one recorded response. Shown when no tutorial/onboarding question is detected in the form." />
            </div>
            <div className="text-2xl font-bold text-[#00FFFF]">{participantCount}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              {participantCount === project.totalResponses
                ? 'all tests shown'
                : `${participantCount} of ${project.totalResponses} shown`}
            </div>
          </Link>
        )}
      </div>

      {/* ── SECTION 2: CORE EXPERIENCE SCORES ────────────────────────── */}
      <SectionLabel action={
        <Link href="/categories" className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 transition-colors">
          All categories <ChevronRight className="w-3 h-3" />
        </Link>
      }>
        Core Experience Scores
      </SectionLabel>

      <div className="bg-slate-800/20 rounded-2xl border border-slate-700/60 p-5 mb-10">
        <CategoryGaugeRow categories={d.catScores} />
      </div>

      {/* ── SECTION 3: THREE-COLUMN INSIGHTS ─────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr_1fr] gap-5 mb-10">

        {/* ── Left: BEST & WORST QUESTIONS ─────────────────────────── */}
        <QuestionHighlights best={d.bestQuestions} worst={d.worstQuestions} />

        {/* ── Middle: BIGGEST FLAWS + AI RECOMMENDATIONS (wider) ───── */}
        <div className="flex flex-col gap-4">
          <div className="bg-slate-800/20 rounded-2xl border border-slate-700/60 p-5 flex-1 flex flex-col">

            {/* Header + AI trigger */}
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-2 min-w-0">
                <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Biggest Flaws</span>
              </div>
              {d.flaws.length > 0 && (
                <button
                  onClick={runFlawRecs}
                  disabled={aiLoading}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-indigo-600/20 border border-indigo-500/40 text-indigo-300 hover:bg-indigo-600/30 hover:border-indigo-400/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                >
                  {aiLoading
                    ? <><RefreshCw className="w-3 h-3 animate-spin" /> Generating…</>
                    : aiRecs
                    ? <><RefreshCw className="w-3 h-3" /> Re-run</>
                    : <><Sparkles className="w-3 h-3" /> AI Fixes</>}
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500 mb-4">Lowest-scoring areas — where players pushed back hardest</p>

            {/* Worst-scoring areas */}
            {d.flaws.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-8">Upload playtest responses to see flaws</p>
            ) : (
              <div className="space-y-2.5">
                {d.flaws.map((f) => (
                  <Link
                    key={f.id}
                    href={`/categories/${f.id}`}
                    className="block p-3 rounded-xl border border-slate-700/60 hover:border-red-500/40 hover:bg-red-900/10 transition-colors group"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-200 group-hover:text-red-300 transition-colors truncate">{f.title}</span>
                      <span className="text-sm font-bold text-red-400 flex-shrink-0">{f.score}</span>
                    </div>
                    <div className="mt-2 h-1.5 rounded-full bg-slate-700/50 overflow-hidden">
                      <div className="h-full rounded-full bg-red-500/70" style={{ width: `${Math.max(2, f.score)}%` }} />
                    </div>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {f.negativePct > 0 && (
                        <span className="text-[10px] text-red-500">{f.negativePct}% rated low</span>
                      )}
                      {f.themes[0] && <SevBadge sev={f.themes[0].severity} />}
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {/* AI-generated recommendations */}
            {(aiLoading || aiError || aiRecs) && (
              <div className="mt-4 pt-4 border-t border-slate-700/60">
                <div className="flex items-center gap-1.5 mb-3">
                  <Lightbulb className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-400">AI Recommendations</span>
                </div>

                {aiLoading && (
                  <div className="space-y-2.5 animate-pulse">
                    {[0, 1, 2].map(i => (
                      <div key={i} className="rounded-lg bg-slate-800/60 h-16" />
                    ))}
                  </div>
                )}

                {aiError && !aiLoading && (
                  <div className="rounded-lg bg-red-900/20 border border-red-700/40 px-3 py-2.5 text-[11px] text-red-400">
                    {aiError}
                  </div>
                )}

                {aiRecs && !aiLoading && (
                  aiRecs.recommendations.length === 0 ? (
                    <p className="text-[11px] text-slate-500">No recommendations returned.</p>
                  ) : (
                    <div className="space-y-2.5">
                      {aiRecs.recommendations.map((r, i) => (
                        <div key={i} className="rounded-lg bg-slate-900/50 border border-slate-700/40 px-3 py-2.5">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-xs font-semibold text-slate-200 truncate">{r.area}</span>
                            <span className="ml-auto flex-shrink-0"><SevBadge sev={r.priority} /></span>
                          </div>
                          <p className="text-[11px] text-slate-400 leading-relaxed mb-1.5">{r.problem}</p>
                          <div className="flex gap-1.5">
                            <Lightbulb className="w-3 h-3 text-indigo-400 flex-shrink-0 mt-0.5" />
                            <p className="text-[11px] text-indigo-200 leading-relaxed">{r.recommendation}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Right: WHO ARE YOUR PLAYERS ──────────────────────────── */}
        <PlayerDemoWidget testers={testers} />
      </div>

      {/* ── SECTION 4: PLAYER SEGMENT INSIGHTS ──────────────────────── */}
      {(d.segmentCards.length > 0 || d.champion || d.divider) && (
        <>
          <SectionLabel action={
            <Link href="/testers" className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 transition-colors">
              View testers <ChevronRight className="w-3 h-3" />
            </Link>
          }>
            Player Segment Insights
          </SectionLabel>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
            {/* Champions — best-performing segment */}
            {d.champion && (
              <div className="bg-slate-800/20 rounded-2xl border border-slate-700/60 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 rounded-full bg-emerald-900/40 flex items-center justify-center">
                    <Trophy className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{d.champion.dimension}</span>
                  <InfoTooltip text="Your strongest segment: the player group scoring highest above the overall average (at least +5 points). Scores are averaged on a normalized 0–100 scale; only groups with 3+ rating responses qualify." />
                </div>
                <p className="text-sm font-semibold text-slate-200 mb-3 leading-snug">
                  <span className="text-emerald-400">{d.champion.label}</span> players are your champions
                </p>
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex-1 text-center rounded-xl bg-emerald-900/20 border border-emerald-700/30 py-2.5">
                    <div className="text-xl font-bold text-emerald-400">{d.champion.score}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5 truncate px-1">{d.champion.label}</div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-600 flex-shrink-0" />
                  <div className="flex-1 text-center rounded-xl bg-slate-800/40 border border-slate-700 py-2.5">
                    <div className="text-xl font-bold text-slate-300">{d.champion.globalScore}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">Global avg</div>
                  </div>
                </div>
                <div className="text-[11px] text-slate-500 bg-slate-800/40 rounded-lg px-3 py-2">
                  Scoring <span className="font-medium text-emerald-300">+{d.champion.score - d.champion.globalScore}</span> above average
                </div>
              </div>
            )}

            {/* Biggest divider — widest best-vs-worst spread */}
            {d.divider && (
              <div className="bg-slate-800/20 rounded-2xl border border-slate-700/60 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 rounded-full bg-amber-900/40 flex items-center justify-center">
                    <Split className="w-3.5 h-3.5 text-amber-400" />
                  </div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Biggest Divider</span>
                  <InfoTooltip text="The segment dimension where opinions split most — the widest score gap between its highest- and lowest-rating groups (at least 10 points). Points to what best explains the variance in player satisfaction." />
                </div>
                <p className="text-sm font-semibold text-slate-200 mb-3 leading-snug">
                  <span className="text-amber-400">{d.divider.dimension}</span> splits players most
                </p>
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex-1 text-center rounded-xl bg-emerald-900/20 border border-emerald-700/30 py-2.5">
                    <div className="text-xl font-bold text-emerald-400">{d.divider.hiScore}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5 truncate px-1">{d.divider.hiLabel}</div>
                  </div>
                  <span className="text-[11px] font-bold text-slate-500 flex-shrink-0">{d.divider.spread}pt</span>
                  <div className="flex-1 text-center rounded-xl bg-red-900/20 border border-red-700/30 py-2.5">
                    <div className="text-xl font-bold text-red-400">{d.divider.loScore}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5 truncate px-1">{d.divider.loLabel}</div>
                  </div>
                </div>
                <div className="text-[11px] text-slate-500 bg-slate-800/40 rounded-lg px-3 py-2">
                  <span className="font-medium text-slate-300">{d.divider.spread}-point</span> gap between groups
                </div>
              </div>
            )}

            {d.segmentCards.map((seg, i) => (
              <div key={i} className="bg-slate-800/20 rounded-2xl border border-slate-700/60 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 rounded-full bg-violet-900/40 flex items-center justify-center">
                    <Brain className="w-3.5 h-3.5 text-violet-400" />
                  </div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{seg.dimension}</span>
                  <InfoTooltip text="A player segment scoring significantly below the overall average (at least 7 points lower). 'Most affected' shows the weakest category area dragging this group down. Only groups with 3+ rating responses qualify." />
                </div>
                <p className="text-sm font-semibold text-slate-200 mb-3 leading-snug">
                  <span className="text-indigo-400">{seg.worstLabel}</span> players scored significantly lower
                </p>
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex-1 text-center rounded-xl bg-red-900/20 border border-red-700/30 py-2.5">
                    <div className="text-xl font-bold text-red-400">{seg.worstScore}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5 truncate px-1">{seg.worstLabel}</div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-600 flex-shrink-0" />
                  <div className="flex-1 text-center rounded-xl bg-slate-800/40 border border-slate-700 py-2.5">
                    <div className="text-xl font-bold text-slate-300">{seg.globalScore}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">Global avg</div>
                  </div>
                </div>
                <div className="text-[11px] text-slate-500 bg-slate-800/40 rounded-lg px-3 py-2">
                  Most affected: <span className="font-medium text-slate-300">{seg.topArea}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── FOOTER ──────────────────────────────────────────────────── */}
      <div className="pt-6 border-t border-slate-700/60 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs text-slate-500">
          <CompanyLogo className="w-5" />
          Playlytix · {dateStr}
        </span>
        <div className="flex items-center gap-5">
          <Link href="/categories" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">Category Scores</Link>
          <Link href="/testers" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">Testers</Link>
          <Link href="/export" className="flex items-center gap-1 text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors">
            Export Report <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>

    </div>
  );
}
