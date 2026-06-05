'use client';
import { useMemo } from 'react';
import { type ElementType } from 'react';
import Link from 'next/link';
import {
  Users, Star, TrendingUp, ThumbsUp, Target, BarChart2,
  CheckCircle2, ArrowRight, ChevronRight, Brain,
  AlertTriangle, Clock, Download, Sparkles, User,
} from 'lucide-react';
import { useDashboardStore } from '@/lib/store';
import type { Question, Severity } from '@/lib/types';

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

const scoreTextColor = (s: number) => s >= 70 ? 'text-emerald-400' : s >= 45 ? 'text-amber-400' : 'text-red-400';
const scoreBgBar     = (s: number) => s >= 70 ? 'bg-emerald-500'   : s >= 45 ? 'bg-amber-400'   : 'bg-red-500';

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

interface KpiCard {
  label: string; value: string; icon: ElementType;
  positive: number; neutral: number; negative: number;
  n: number; status: 'good' | 'warning' | 'critical';
}

export default function OverviewPage() {
  const project    = useDashboardStore(s => s.project);
  const questions  = useDashboardStore(s => s.questions);
  const responses  = useDashboardStore(s => s.responses);
  const categories = useDashboardStore(s => s.categories);
  const testers    = useDashboardStore(s => s.testers);
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
        positive: p(pos), neutral: p(rs.length - pos - neg), negative: p(neg), n: rs.length,
      };
    };

    const catQuote = (catId: string) => {
      const qIds = new Set(questions.filter(q => q.categoryId === catId && q.type === 'free_text').map(q => q.id));
      const rs = responses.filter(r => qIds.has(r.questionId) && r.rawAnswer.trim().length >= 30 && r.rawAnswer.trim().length <= 200);
      return rs[0]?.rawAnswer ?? null;
    };

    // ── Snapshot stats ─────────────────────────────────────────────────────
    const playtimeQ = questions.find(q =>
      /how many hours.*(?:play|game|session)|hours.*played.*(?:exo|game|session)|session.*(?:duration|length)/i.test(q.text)
    );
    const playtimeValues = playtimeQ
      ? responses.filter(r => r.questionId === playtimeQ.id && r.numericValue !== null).map(r => r.numericValue!)
      : [];
    const avgPlaytime = playtimeValues.length
      ? playtimeValues.reduce((a, b) => a + b, 0) / playtimeValues.length
      : null;

    const ageCounts: Record<string, number> = {};
    for (const t of testers) {
      if (t.ageGroup) ageCounts[t.ageGroup] = (ageCounts[t.ageGroup] ?? 0) + 1;
    }
    const mostCommonAge = Object.entries(ageCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    const allNorm = responses.filter(r => r.normalizedScore !== null).map(r => r.normalizedScore!);
    const overallScore = allNorm.length
      ? Math.round(allNorm.reduce((a, b) => a + b, 0) / allNorm.length)
      : null;

    // ── KPI cards ──────────────────────────────────────────────────────────
    const q = (pat: RegExp): Question | undefined => questions.find(q => pat.test(q.text));
    const enjoyQ   = q(/enjoy.*overall|overall.*enjoy/i);
    const clarityQ = q(/game.?mechanic.*overall|how.*intuitive/i);
    const retQ     = q(/continue.*playing/i);
    const npsQ     = q(/recommend.*friend/i);

    const kpiDefs: Array<[Question | undefined, string, ElementType, 5 | 10]> = [
      [enjoyQ,   'Overall Enjoyment',       Star,       5],
      [clarityQ, 'Gameplay Clarity',         Target,     5],
      [retQ,     'Continue Playing Intent',  TrendingUp, 10],
      [npsQ,     'Recommendation Score',     ThumbsUp,   10],
    ];
    const kpis: KpiCard[] = kpiDefs
      .filter(([question]) => !!question)
      .flatMap(([question, label, icon, scale]) => {
        const s = qSentiment(question!.id, scale);
        if (!s) return [];
        return [{
          label, icon, n: s.n,
          value: `${s.avg.toFixed(1)} / ${scale}`,
          positive: s.positive, neutral: s.neutral, negative: s.negative,
          status: (s.positive >= 60 ? 'good' : s.positive >= 38 ? 'warning' : 'critical') as KpiCard['status'],
        }];
      });

    if (kpis.length === 0 && allNorm.length) {
      const avg = allNorm.reduce((a, b) => a + b, 0) / allNorm.length;
      const pos = allNorm.filter(s => s >= 60).length;
      const neg = allNorm.filter(s => s < 35).length;
      const p = (n: number) => Math.round((n / allNorm.length) * 100);
      kpis.push({
        label: 'Overall Satisfaction', icon: BarChart2, n: allNorm.length,
        value: `${Math.round(avg)} / 100`,
        positive: p(pos), neutral: p(allNorm.length - pos - neg), negative: p(neg),
        status: avg >= 60 ? 'good' : avg >= 35 ? 'warning' : 'critical',
      });
    }

    // ── Category scores ────────────────────────────────────────────────────
    const catScores = categories
      .filter(c => !/admin|internal|evidence|background|recording/i.test(c.name))
      .flatMap(c => { const s = catStats(c.id); return s ? [{ ...c, avg: s.avg, n: s.n }] : []; })
      .sort((a, b) => b.avg - a.avg);

    // ── Strengths (top 3) ──────────────────────────────────────────────────
    const strengths = catScores.slice(0, 3).map(c => ({
      title: c.name, id: c.id,
      score: Math.round(c.avg), n: c.n,
      quote: catQuote(c.id),
    }));

    // ── Concerns (bottom 3 — always data-driven, no AI needed) ────────────
    const concerns = [...catScores].slice(-3).reverse().map(c => {
      const qIds = new Set(questions.filter(q => q.categoryId === c.id).map(q => q.id));
      const rVals = responses.filter(r => qIds.has(r.questionId) && r.normalizedScore !== null);
      const negativePct = rVals.length
        ? Math.round((rVals.filter(r => (r.normalizedScore ?? 100) < 40).length / rVals.length) * 100)
        : 0;
      const catThemes = themes
        .filter(t => t.categoryId === c.id)
        .map(t => ({ label: t.label, severity: t.severity as Severity }));
      return { id: c.id, title: c.name, score: Math.round(c.avg), n: c.n, negativePct, catThemes };
    });

    // ── Segment insights ───────────────────────────────────────────────────
    const tMap = new Map(testers.map(t => [t.id, t]));
    const globalAvg = allNorm.length ? allNorm.reduce((a, b) => a + b, 0) / allNorm.length : 0;

    const segDelta = (key: 'gamer_type' | 'age_group' | 'hardware_tier', dimLabel: string) => {
      const groups = new Map<string, number[]>();
      for (const r of responses) {
        if (r.normalizedScore === null || !r.testerId) continue;
        const raw = tMap.get(r.testerId)?.segments[key];
        if (!raw) continue;
        const label = raw.split(',')[0].trim();
        const arr = groups.get(label) ?? []; arr.push(r.normalizedScore); groups.set(label, arr);
      }
      let worst: { label: string; avg: number } | null = null;
      for (const [label, sc] of groups) {
        if (sc.length < 3) continue;
        const avg = sc.reduce((a, b) => a + b, 0) / sc.length;
        if (!worst || avg < worst.avg) worst = { label, avg };
      }
      if (!worst || globalAvg - worst.avg < 7) return null;
      return {
        dimension: dimLabel,
        worstLabel: worst.label,
        worstScore: Math.round(worst.avg),
        globalScore: Math.round(globalAvg),
        topArea: catScores.filter(c => c.avg < 55)[0]?.name ?? 'Multiple areas',
      };
    };

    const segmentCards = [
      segDelta('gamer_type',    'Gamer Type'),
      segDelta('age_group',     'Age Group'),
      segDelta('hardware_tier', 'Hardware Tier'),
    ].filter((s): s is NonNullable<typeof s> => s !== null);

    return { kpis, catScores, strengths, concerns, segmentCards, avgPlaytime, mostCommonAge, overallScore };
  }, [questions, responses, categories, testers, themes]);

  if (!project) return null;

  const hasThemes = themes.length > 0;
  const dateStr = new Date(project.createdAt).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  return (
    <div className="min-h-screen px-8 py-10 max-w-[1200px] mx-auto">

      {/* ── PAGE HEADER ──────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-10">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1">
            Playtest Research Report
          </div>
          <h1 className="text-[2rem] font-bold text-white tracking-tight leading-none">
            {project.gameName || project.name}
          </h1>
          <p className="text-base text-slate-400 mt-1.5">{project.playtestName}</p>
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            <span className="flex items-center gap-1.5 text-sm text-slate-400">
              <Users className="w-3.5 h-3.5 text-slate-500" />
              {project.totalResponses} participants
            </span>
            <span className="text-slate-700">·</span>
            <span className="text-sm text-slate-400">{dateStr}</span>
            <span className="text-slate-700">·</span>
            <span className="text-sm text-slate-500">Prepared by Playtest Insights</span>
          </div>
        </div>
        <Link
          href="/export"
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-slate-800/60 border border-slate-700 text-slate-300 hover:border-indigo-500/60 hover:text-indigo-300 transition-colors flex-shrink-0"
        >
          <Download className="w-3.5 h-3.5" />
          Export Report
        </Link>
      </div>

      {/* ── SECTION 1: SNAPSHOT ─────────────────────────────────────── */}
      <SectionLabel>Snapshot</SectionLabel>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        {[
          {
            label: 'Participants',
            value: String(project.totalResponses),
            sub: project.matchedTesters < project.totalResponses
              ? `${project.matchedTesters} matched to profiles`
              : 'all matched to profiles',
            Icon: Users,
            valueColor: 'text-white',
          },
          {
            label: 'Avg Playtime',
            value: d.avgPlaytime !== null ? `${d.avgPlaytime.toFixed(1)}h` : '—',
            sub: d.avgPlaytime !== null ? 'hours this session' : 'no session data detected',
            Icon: Clock,
            valueColor: d.avgPlaytime !== null ? 'text-white' : 'text-slate-600',
          },
          {
            label: 'Top Age Group',
            value: d.mostCommonAge ?? '—',
            sub: d.mostCommonAge ? 'most common in tester pool' : 'no registration data',
            Icon: User,
            valueColor: d.mostCommonAge ? 'text-white' : 'text-slate-600',
          },
          {
            label: 'Overall Score',
            value: d.overallScore !== null ? String(d.overallScore) : '—',
            sub: '/100 normalised avg',
            Icon: BarChart2,
            valueColor: d.overallScore !== null ? scoreTextColor(d.overallScore) : 'text-slate-600',
          },
        ].map(({ label, value, sub, Icon, valueColor }) => (
          <div key={label} className="bg-slate-800/30 rounded-2xl border border-slate-700/60 p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-slate-700/60 flex items-center justify-center">
                <Icon className="w-3.5 h-3.5 text-slate-400" />
              </div>
              <span className="text-xs font-medium text-slate-400">{label}</span>
            </div>
            <div className={`text-2xl font-bold ${valueColor}`}>{value}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>
          </div>
        ))}
      </div>

      {/* ── SECTION 2: PLAYTEST HEALTH ──────────────────────────────── */}
      <SectionLabel action={`${project.totalResponses} responses analysed`}>
        Playtest Health
      </SectionLabel>

      {d.kpis.length === 0 ? (
        <div className="rounded-2xl bg-slate-800/20 border border-slate-700/60 p-10 text-center mb-10">
          <p className="text-sm text-slate-500">Upload an Excel file to populate health metrics</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          {d.kpis.map((kpi) => {
            const Icon = kpi.icon;
            const statusRing = kpi.status === 'good'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
              : kpi.status === 'warning'
              ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
              : 'border-red-500/30 bg-red-500/10 text-red-400';
            const statusDot = kpi.status === 'good' ? 'bg-emerald-500' : kpi.status === 'warning' ? 'bg-amber-400' : 'bg-red-500';
            const statusLbl = kpi.status === 'good' ? 'Good' : kpi.status === 'warning' ? 'Needs Work' : 'Critical';
            return (
              <div key={kpi.label} className="bg-slate-800/30 rounded-2xl border border-slate-700/60 p-5 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-slate-700/60 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                    <span className="text-xs font-medium text-slate-400 leading-tight">{kpi.label}</span>
                  </div>
                  <span className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border flex-shrink-0 ${statusRing}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${statusDot}`} />
                    {statusLbl}
                  </span>
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">{kpi.value}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">n={kpi.n} responses</div>
                </div>
                <div className="space-y-1.5 pt-1 border-t border-slate-700/60">
                  {([
                    { label: 'Positive', pct: kpi.positive, color: '#10b981' },
                    { label: 'Neutral',  pct: kpi.neutral,  color: '#f59e0b' },
                    { label: 'Negative', pct: kpi.negative, color: '#ef4444' },
                  ] as const).map(({ label, pct, color }) => (
                    <div key={label} className="flex items-center gap-2">
                      <div className="w-14 text-[10px] text-slate-500">{label}</div>
                      <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                      </div>
                      <div className="w-7 text-[10px] text-slate-400 text-right font-medium">{pct}%</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── SECTION 3: CATEGORY SCORECARD ───────────────────────────── */}
      <SectionLabel action={
        <Link href="/categories" className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 transition-colors">
          All categories <ChevronRight className="w-3 h-3" />
        </Link>
      }>
        Category Scorecard
      </SectionLabel>

      {d.catScores.length === 0 ? (
        <div className="rounded-2xl bg-slate-800/20 border border-slate-700/60 p-10 text-center mb-10">
          <p className="text-sm text-slate-500">No category data yet — upload your Excel file</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 mb-10">
          {[...d.catScores].reverse().map((cat) => (
            <Link
              key={cat.id}
              href={`/categories/${cat.id}`}
              className="bg-slate-800/30 rounded-xl border border-slate-700/60 p-4 hover:border-indigo-500/50 hover:bg-slate-800/50 transition-all group"
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <span className="text-sm font-semibold text-slate-200 leading-snug group-hover:text-indigo-300 transition-colors line-clamp-2">
                  {cat.name}
                </span>
                <span className={`text-xl font-bold flex-shrink-0 ${scoreTextColor(Math.round(cat.avg))}`}>
                  {Math.round(cat.avg)}
                </span>
              </div>
              <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden mb-2">
                <div
                  className={`h-full rounded-full ${scoreBgBar(Math.round(cat.avg))}`}
                  style={{ width: `${Math.round(cat.avg)}%` }}
                />
              </div>
              <div className="text-[10px] text-slate-500">{cat.n} responses</div>
            </Link>
          ))}
        </div>
      )}

      {/* ── SECTION 4: STRENGTHS & CONCERNS ─────────────────────────── */}
      <SectionLabel>Core Insights</SectionLabel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-10">
        {/* Strengths */}
        <div className="bg-slate-800/20 rounded-2xl border border-slate-700/60 p-6">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-6 h-6 rounded-full bg-emerald-900/40 flex items-center justify-center">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <span className="text-sm font-semibold text-slate-100">Top Strengths</span>
            <span className="text-[10px] text-slate-500 ml-auto uppercase tracking-wider">From ratings</span>
          </div>
          {d.strengths.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-8">No rating data — upload playtest responses</p>
          ) : (
            <div className="space-y-3.5">
              {d.strengths.map((s, i) => (
                <Link key={i} href={`/categories/${s.id}`}
                  className="block rounded-xl bg-emerald-900/10 border border-emerald-700/30 px-4 py-3.5 hover:border-emerald-600/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="text-sm font-semibold text-slate-100 leading-snug">{s.title}</div>
                    <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-emerald-900/40 flex items-center justify-center">
                      <span className="text-sm font-bold text-emerald-400">{s.score}</span>
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-500 mb-2.5">{s.n} responses · normalised avg</div>
                  {s.quote && (
                    <blockquote className="text-xs text-slate-400 italic border-l-2 border-emerald-700/50 pl-3 leading-relaxed line-clamp-2">
                      &ldquo;{s.quote}&rdquo;
                    </blockquote>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Areas of Concern — always data-driven, no AI required */}
        <div className="bg-slate-800/20 rounded-2xl border border-slate-700/60 p-6">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-6 h-6 rounded-full bg-red-900/40 flex items-center justify-center">
              <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
            </div>
            <span className="text-sm font-semibold text-slate-100">Areas of Concern</span>
            <span className="text-[10px] text-slate-500 ml-auto uppercase tracking-wider">From ratings</span>
          </div>
          {d.concerns.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-8">No rating data — upload playtest responses</p>
          ) : (
            <div className="space-y-3">
              {d.concerns.map((c) => (
                <Link key={c.id} href={`/categories/${c.id}`}
                  className="block rounded-xl border border-slate-700/60 px-4 py-3.5 hover:border-red-500/40 hover:bg-red-900/10 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3 mb-1.5">
                    <div className="text-sm font-semibold text-slate-100 leading-snug">{c.title}</div>
                    <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-red-900/20 flex items-center justify-center border border-red-700/30">
                      <span className={`text-sm font-bold ${scoreTextColor(c.score)}`}>{c.score}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-[11px] text-slate-500">{c.n} responses</span>
                    {c.negativePct > 0 && (
                      <span className="text-[11px] text-red-400 font-medium">{c.negativePct}% low scores</span>
                    )}
                  </div>
                  {c.catThemes.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <SevBadge sev={c.catThemes[0].severity} />
                      <span className="text-[10px] text-slate-500 self-center">{c.catThemes[0].label}</span>
                    </div>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── SECTION 5: PLAYER SEGMENT INSIGHTS ──────────────────────── */}
      <SectionLabel action={
        <Link href="/testers" className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 transition-colors">
          View testers <ChevronRight className="w-3 h-3" />
        </Link>
      }>
        Player Segment Insights
      </SectionLabel>

      {d.segmentCards.length === 0 ? (
        <div className="bg-slate-800/20 rounded-2xl border border-slate-700/60 p-8 text-center mb-10">
          <p className="text-sm text-slate-500">No significant segment differences detected</p>
          <p className="text-xs text-slate-600 mt-1">Requires matched registration profiles with at least 3 testers per segment</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
          {d.segmentCards.map((seg, i) => (
            <div key={i} className="bg-slate-800/20 rounded-2xl border border-slate-700/60 p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 rounded-full bg-violet-900/40 flex items-center justify-center">
                  <Brain className="w-3.5 h-3.5 text-violet-400" />
                </div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{seg.dimension}</span>
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
      )}

      {/* ── SECTION 6: AI INSIGHTS BANNER ───────────────────────────── */}
      {hasThemes ? (
        <div className="bg-indigo-900/20 border border-indigo-700/40 rounded-2xl px-6 py-4 flex items-center justify-between mb-10">
          <div className="flex items-center gap-3">
            <Sparkles className="w-4 h-4 text-indigo-400 flex-shrink-0" />
            <span className="text-sm text-indigo-300 font-medium">
              {themes.length} AI-detected themes across {new Set(themes.map(t => t.categoryId).filter(Boolean)).size} categories
            </span>
          </div>
          <Link href="/themes" className="flex items-center gap-1 text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors">
            View themes <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      ) : (
        <div className="bg-slate-800/20 border border-slate-700/60 rounded-2xl px-6 py-4 flex items-center justify-between mb-10">
          <div className="flex items-center gap-3">
            <Sparkles className="w-4 h-4 text-slate-500 flex-shrink-0" />
            <span className="text-sm text-slate-500">
              Add AI analysis to surface qualitative patterns in open-ended responses
            </span>
          </div>
          <Link href="/themes" className="flex items-center gap-1 text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors">
            Run Analysis <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      {/* ── FOOTER ──────────────────────────────────────────────────── */}
      <div className="pt-6 border-t border-slate-700/60 flex items-center justify-between">
        <span className="text-xs text-slate-500">Playtest Insights · {dateStr}</span>
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
