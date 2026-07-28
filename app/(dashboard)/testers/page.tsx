'use client';
import { useMemo, useState } from 'react';
import { Search, Star, AlertTriangle, Globe, Gamepad2, Clock, Monitor, UserX, Target, PenLine } from 'lucide-react';
import { useDashboardStore, selectFilteredTesters, selectGameConfig } from '@/lib/store';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import { Users } from 'lucide-react';
import { formatTesterLabel } from '@/lib/utils';
import { flagLabel } from '@/lib/outliers';
import { genreFit, engagement, testerGenres, testerPlaystyles } from '@/lib/testerProfile';
import type { TesterFlagType } from '@/lib/types';
import GeoDistributionMap from '@/components/charts/GeoDistributionMap';
import { continentFor } from '@/lib/geo';

type DistributionRow = {
  label: string;
  count: number;
  pct: number;
};

function distribution(values: string[], total: number): DistributionRow[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    const label = value.trim() || 'Unknown';
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, count]) => ({
      label,
      count,
      pct: total > 0 ? Math.round((count / total) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function DistributionBars({ rows, maxRows = 6 }: { rows: DistributionRow[]; maxRows?: number }) {
  return (
    <div className="space-y-2.5">
      {rows.slice(0, maxRows).map((row) => (
        <div key={row.label} className="grid grid-cols-[112px_1fr_42px] items-center gap-3">
          <div className="text-xs text-slate-400 truncate" title={row.label}>{row.label}</div>
          <div className="h-2 rounded-full bg-slate-700/60 overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${row.pct}%`,
                background: 'linear-gradient(90deg, rgb(0, 102, 255), rgb(0, 255, 255))',
              }}
            />
          </div>
          <div className="text-[10px] text-slate-500 text-right">{row.count}</div>
        </div>
      ))}
    </div>
  );
}

export default function TestersPage() {
  const testers = useDashboardStore(selectFilteredTesters);
  const responses = useDashboardStore((s) => s.responses);
  const questions = useDashboardStore((s) => s.questions);
  const config = useDashboardStore(selectGameConfig);
  const openTesterPanel = useDashboardStore((s) => s.openTesterPanel);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | TesterFlagType | 'unmatched' | 'target_genre' | 'detailed'>('all');

  // Per-tester taste/quality intel, keyed by tester id.
  const intel = useMemo(() => {
    const map = new Map<string, { isFit: boolean; detailed: boolean }>();
    for (const t of testers) {
      map.set(t.id, {
        isFit: genreFit(t, config).isFit,
        detailed: engagement(t.id, responses, questions).tier === 'detailed',
      });
    }
    return map;
  }, [testers, responses, questions, config]);

  const targetGenreCount = useMemo(() => [...intel.values()].filter((v) => v.isFit).length, [intel]);
  const detailedCount = useMemo(() => [...intel.values()].filter((v) => v.detailed).length, [intel]);

  // Credibility lens: do target-genre players rate the primary KPI differently?
  const lens = useMemo(() => {
    const kpi = config.kpis[0];
    if (!kpi) return null;
    const kpiQ = questions.find((q) => kpi.pattern.test(q.text));
    if (!kpiQ) return null;
    const fitIds = new Set(testers.filter((t) => intel.get(t.id)?.isFit).map((t) => t.id));
    const avg = (predicate: (id: string) => boolean) => {
      const vals = responses
        .filter((r) => r.questionId === kpiQ.id && r.numericValue !== null && r.testerId && predicate(r.testerId))
        .map((r) => r.numericValue!);
      return vals.length ? { avg: vals.reduce((a, b) => a + b, 0) / vals.length, n: vals.length } : null;
    };
    const fit = avg((id) => fitIds.has(id));
    const others = avg((id) => !fitIds.has(id));
    if (!fit || !others) return null;
    return { label: kpi.label, max: kpi.scaleMax, fit, others };
  }, [testers, responses, questions, config, intel]);

  // Testers whose email was looked up but NOT found in the Playlytix registry.
  // (inRegistry === false is a definite "not found"; undefined means we didn't look up.)
  const unmatchedCount = useMemo(
    () => testers.filter((t) => t.inRegistry === false).length,
    [testers],
  );

  // Which flag types are actually present, with counts (drives the filter chips).
  const flagCounts = useMemo(() => {
    const counts: Record<TesterFlagType, number> = {
      harsh_critic: 0, overly_positive: 0, straight_liner: 0,
    };
    for (const t of testers) {
      for (const f of t.quality?.flags ?? []) counts[f.type]++;
    }
    return counts;
  }, [testers]);

  const overview = useMemo(() => {
    const total = testers.length;
    const countries = testers.map((t) => t.segments.country || t.country || '');
    const continents = countries.map(continentFor);
    const ages = testers.map((t) => t.ageGroup || t.segments.age_group || '');
    const hardware = testers.map((t) => t.segments.hardware_tier || 'Unknown');
    const gamerTypes = testers.flatMap((t) => {
      const raw = t.segments.gamer_type || t.gamingProfile || '';
      return raw.split(',').map((v) => v.trim()).filter(Boolean);
    });
    const genres = testers.flatMap((t) => testerGenres(t));
    const playstyles = testers.flatMap((t) => testerPlaystyles(t));

    const countryRows = distribution(countries, total).filter((row) => row.label !== 'Unknown');
    const continentRows = distribution(continents, total);
    const ageRows = distribution(ages, total);
    const hardwareRows = distribution(hardware, total);
    const gamerRows = distribution(gamerTypes, Math.max(gamerTypes.length, 1));
    const genreRows = distribution(genres, Math.max(genres.length, 1));
    const playstyleRows = distribution(playstyles, Math.max(playstyles.length, 1));
    const matchedProfiles = testers.filter((t) => t.inRegistry === true || Object.keys(t.segments).length > 0).length;

    return {
      countryRows,
      continentRows,
      ageRows,
      hardwareRows,
      gamerRows,
      genreRows,
      playstyleRows,
      matchedProfiles,
      topCountry: countryRows[0]?.label ?? 'Unknown',
      topContinent: continentRows[0]?.label ?? 'Unknown',
    };
  }, [testers]);

  const visible = testers
    .filter((t) => {
      const q = search.toLowerCase();
      const matchSearch = !q || formatTesterLabel(t).toLowerCase().includes(q);
      const matchFilter =
        filter === 'all'
          ? true
          : filter === 'unmatched'
            ? t.inRegistry === false
            : filter === 'target_genre'
              ? (intel.get(t.id)?.isFit ?? false)
              : filter === 'detailed'
                ? (intel.get(t.id)?.detailed ?? false)
                : (t.quality?.flags.some((f) => f.type === filter) ?? false);
      return matchSearch && matchFilter;
    })
    .sort((a, b) => {
      const aLabel = formatTesterLabel(a), bLabel = formatTesterLabel(b);
      const na = parseInt(aLabel), nb = parseInt(bLabel);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return aLabel.localeCompare(bLabel);
    });

  if (!testers.length) {
    return (
      <div className="px-8 py-8">
        <PageHeader title="Testers" sub="Participating playtesters from submitted response rows" />
        <EmptyState icon={Users} title="No testers yet" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1680px] px-6 lg:px-8 py-8">
      <PageHeader
        title="Testers"
        sub={(() => {
          const parts = [`${testers.length} testers`];
          if (targetGenreCount) parts.push(`${targetGenreCount} target-genre`);
          if (detailedCount) parts.push(`${detailedCount} detailed responders`);
          if (unmatchedCount) parts.push(`${unmatchedCount} not in registry`);
          if (flagCounts.harsh_critic) parts.push(`${flagCounts.harsh_critic} harsh critics`);
          if (flagCounts.straight_liner) parts.push(`${flagCounts.straight_liner} straight-lining`);
          return parts.join(' · ');
        })()}
      />

      {/* Tester overview */}
      <div className="space-y-4 mb-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Participating Testers', value: testers.length, sub: `${overview.matchedProfiles} with profile data`, Icon: Users },
            { label: 'Top Region', value: overview.topContinent, sub: 'largest tester cluster', Icon: Globe },
            { label: 'Top Country', value: overview.topCountry, sub: 'most common country', Icon: Globe },
            { label: 'Hardware Mix', value: overview.hardwareRows[0]?.label ?? 'Unknown', sub: 'largest setup tier', Icon: Monitor },
          ].map(({ label, value, sub, Icon }) => (
            <div key={label} className="rounded-xl border border-slate-700/60 bg-slate-800/20 p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-slate-700/60 flex items-center justify-center">
                  <Icon className="w-3.5 h-3.5 text-indigo-400" />
                </div>
                <span className="text-xs text-slate-400">{label}</span>
              </div>
              <div className="text-xl font-bold text-white truncate" title={String(value)}>{value}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>
            </div>
          ))}
        </div>

        {/* Geographic spread — full width with a large map */}
        <div className="rounded-xl border border-slate-700/60 bg-slate-800/20 p-5">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <div className="text-sm font-semibold text-white">Geographic Spread</div>
              <p className="text-xs text-slate-400 mt-0.5">Tester distribution grouped by continent · hover a region for counts</p>
            </div>
            <span className="text-[10px] text-slate-500 uppercase tracking-wide">{overview.countryRows.length} countries</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1.85fr_1fr] gap-6 items-start">
            <GeoDistributionMap data={overview.continentRows} />
            <div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">By continent</div>
              <DistributionBars rows={overview.continentRows} />
              {overview.countryRows.length > 0 && (
                <div className="mt-5 pt-4 border-t border-slate-700/60">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">Top countries</div>
                  <div className="flex flex-wrap gap-2">
                    {overview.countryRows.slice(0, 8).map((row) => (
                      <span key={row.label} className="rounded-full border border-slate-700/60 bg-slate-900/40 px-2.5 py-1 text-xs text-slate-300">
                        {row.label} <span className="text-slate-500">{row.count}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Age + player profile */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-slate-700/60 bg-slate-800/20 p-5">
            <div className="text-sm font-semibold text-white mb-1">Age Distribution</div>
            <p className="text-xs text-slate-400 mb-4">Useful as context, not a core health metric</p>
            <DistributionBars rows={overview.ageRows} />
          </div>

          <div className="rounded-xl border border-slate-700/60 bg-slate-800/20 p-5">
            <div className="text-sm font-semibold text-white mb-1">Player Profile</div>
            <p className="text-xs text-slate-400 mb-4">Hardware and self-described gamer type</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">Hardware</div>
                <DistributionBars rows={overview.hardwareRows} maxRows={4} />
              </div>
              {overview.gamerRows.length > 0 && (
                <div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">Gamer type</div>
                  <DistributionBars rows={overview.gamerRows} maxRows={4} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Player taste + credibility lens */}
      {(overview.genreRows.length > 0 || lens) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
          {overview.genreRows.length > 0 && (
            <div className="rounded-xl border border-slate-700/60 bg-slate-800/20 p-5">
              <div className="text-sm font-semibold text-white mb-1">Genre Preferences</div>
              <p className="text-xs text-slate-400 mb-4">From the Type-of-Gamer data · target genres drive credibility</p>
              <DistributionBars rows={overview.genreRows} maxRows={6} />
            </div>
          )}
          {overview.playstyleRows.length > 0 && (
            <div className="rounded-xl border border-slate-700/60 bg-slate-800/20 p-5">
              <div className="text-sm font-semibold text-white mb-1">Playstyles</div>
              <p className="text-xs text-slate-400 mb-4">How these testers prefer to play</p>
              <DistributionBars rows={overview.playstyleRows} maxRows={6} />
            </div>
          )}
          {lens && (
            <div className="rounded-xl border border-cyan-700/40 bg-cyan-500/5 p-5">
              <div className="flex items-center gap-2 mb-1">
                <Target className="w-4 h-4 text-cyan-400" />
                <div className="text-sm font-semibold text-white">Credibility Lens</div>
              </div>
              <p className="text-xs text-slate-400 mb-4">
                Do players who actually like this genre feel differently about <span className="text-slate-300">{lens.label}</span>?
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-slate-900/40 border border-cyan-600/30 p-3">
                  <div className="text-[10px] text-cyan-300/80 uppercase tracking-wide mb-1">Target-genre</div>
                  <div className="text-xl font-bold text-cyan-300">{lens.fit.avg.toFixed(1)} <span className="text-xs text-slate-500">/ {lens.max}</span></div>
                  <div className="text-[10px] text-slate-500 mt-0.5">n={lens.fit.n}</div>
                </div>
                <div className="rounded-lg bg-slate-900/40 border border-slate-700/50 p-3">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Everyone else</div>
                  <div className="text-xl font-bold text-slate-200">{lens.others.avg.toFixed(1)} <span className="text-xs text-slate-500">/ {lens.max}</span></div>
                  <div className="text-[10px] text-slate-500 mt-0.5">n={lens.others.n}</div>
                </div>
              </div>
              <div className="text-[11px] text-slate-400 mt-3">
                {(() => {
                  const diff = lens.fit.avg - lens.others.avg;
                  const mag = Math.abs(diff).toFixed(1);
                  if (Math.abs(diff) < 0.2) return 'Target-genre players rate it about the same as everyone else.';
                  return diff > 0
                    ? `Target-genre players rate it ${mag} higher — the intended audience responds well.`
                    : `Target-genre players rate it ${mag} lower — a caution sign with the intended audience.`;
                })()}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            placeholder="Search by tester ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg bg-slate-800/60 border border-slate-700 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/60 transition-colors"
          />
        </div>
        {(['all', 'harsh_critic', 'overly_positive', 'straight_liner'] as const)
          .filter((f) => f === 'all' || flagCounts[f] > 0)
          .map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors border whitespace-nowrap ${
                filter === f
                  ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-300'
                  : 'border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500'
              }`}
            >
              {f === 'all' ? 'All' : `${flagLabel(f)} (${flagCounts[f]})`}
            </button>
          ))}
        {targetGenreCount > 0 && (
          <button
            onClick={() => setFilter(filter === 'target_genre' ? 'all' : 'target_genre')}
            className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors border whitespace-nowrap flex items-center gap-1.5 ${
              filter === 'target_genre'
                ? 'bg-cyan-600/20 border-cyan-500/40 text-cyan-300'
                : 'border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500'
            }`}
          >
            <Target className="w-3.5 h-3.5" />
            Target-genre ({targetGenreCount})
          </button>
        )}
        {detailedCount > 0 && (
          <button
            onClick={() => setFilter(filter === 'detailed' ? 'all' : 'detailed')}
            className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors border whitespace-nowrap flex items-center gap-1.5 ${
              filter === 'detailed'
                ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300'
                : 'border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500'
            }`}
          >
            <PenLine className="w-3.5 h-3.5" />
            Detailed responders ({detailedCount})
          </button>
        )}
        {unmatchedCount > 0 && (
          <button
            onClick={() => setFilter(filter === 'unmatched' ? 'all' : 'unmatched')}
            className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors border whitespace-nowrap flex items-center gap-1.5 ${
              filter === 'unmatched'
                ? 'bg-amber-600/20 border-amber-500/40 text-amber-300'
                : 'border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500'
            }`}
          >
            <UserX className="w-3.5 h-3.5" />
            Not in registry ({unmatchedCount})
          </button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-700/60 overflow-hidden">
        <div className="max-h-[70vh] overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-700">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-slate-700/60">
              {['Tester', 'Location', 'Gamer Type', 'Hours/wk', 'Avg Rating', ''].map((h) => (
                <th key={h} className="text-left text-xs text-slate-500 font-medium px-4 py-3 uppercase tracking-wide bg-slate-800 border-b border-slate-700/60">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((t, i) => (
              <tr
                key={t.id}
                className={`border-b border-slate-700/30 hover:bg-slate-800/30 cursor-pointer transition-colors ${i % 2 === 0 ? '' : 'bg-slate-800/10'}`}
                onClick={() => openTesterPanel(t.id)}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-indigo-600/30 flex items-center justify-center text-indigo-300 text-xs font-bold flex-shrink-0">
                      {i + 1}
                    </div>
                    <div>
                      <div className="text-slate-200 font-medium">{formatTesterLabel(t)}</div>
                      <div className="text-xs text-slate-500 truncate max-w-[140px]">
                        {t.inRegistry === true ? 'Registry tester' : t.inRegistry === false ? 'Response-only tester' : 'Tester'}
                      </div>
                    </div>
                    {t.quality && t.quality.flags.length > 0 && (
                      <span
                        className="flex-shrink-0 cursor-help"
                        title={t.quality.flags.map((f) => `${flagLabel(f.type)}: ${f.detail}`).join('\n')}
                      >
                        <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />
                      </span>
                    )}
                    {t.inRegistry === false && (
                      <span
                        className="flex-shrink-0 inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-300 cursor-help"
                        title="No matching Playlytix registry profile was found — profile and demographic data are unavailable."
                      >
                        <UserX className="w-3 h-3" />
                        Not in registry
                      </span>
                    )}
                    {intel.get(t.id)?.isFit && (
                      <span className="flex-shrink-0 cursor-help" title="Target-genre player — plays a genre this game is aimed at.">
                        <Target className="w-3.5 h-3.5 text-cyan-400" />
                      </span>
                    )}
                    {intel.get(t.id)?.detailed && (
                      <span className="flex-shrink-0 cursor-help" title="Detailed responder — gave thorough written feedback.">
                        <PenLine className="w-3.5 h-3.5 text-emerald-400" />
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <Globe className="w-3 h-3 text-slate-500" />
                    <span className="text-slate-400 text-xs">{t.segments.country || t.country || '—'}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <Gamepad2 className="w-3 h-3 text-slate-500" />
                    <span className="text-slate-400 text-xs truncate max-w-[120px]">
                      {t.segments.gamer_type || t.gamingProfile || '—'}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3 h-3 text-slate-500" />
                    <span className="text-slate-400 text-xs">{t.segments.gaming_hours || '—'}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {t.avgRating !== undefined ? (
                    <div className="flex items-center gap-1">
                      <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                      <span className="text-slate-200 font-semibold">{t.avgRating.toFixed(1)}</span>
                    </div>
                  ) : <span className="text-slate-600">—</span>}
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs text-indigo-400 hover:text-indigo-300">View →</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && (
          <div className="text-center py-10 text-slate-500 text-sm">No testers match your search</div>
        )}
        </div>
      </div>
    </div>
  );
}
