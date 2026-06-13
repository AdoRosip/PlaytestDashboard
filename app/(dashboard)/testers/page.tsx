'use client';
import { useMemo, useState } from 'react';
import { Search, Star, AlertTriangle, Globe, Gamepad2, Clock, Monitor } from 'lucide-react';
import { useDashboardStore, selectFilteredTesters } from '@/lib/store';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import { Users } from 'lucide-react';
import { formatTesterId } from '@/lib/utils';
import GeoDistributionMap from '@/components/charts/GeoDistributionMap';

type DistributionRow = {
  label: string;
  count: number;
  pct: number;
};

const COUNTRY_TO_CONTINENT: Record<string, string> = {
  argentina: 'South America',
  australia: 'Oceania',
  austria: 'Europe',
  belgium: 'Europe',
  brazil: 'South America',
  bulgaria: 'Europe',
  canada: 'North America',
  chile: 'South America',
  china: 'Asia',
  colombia: 'South America',
  croatia: 'Europe',
  czechia: 'Europe',
  'czech republic': 'Europe',
  denmark: 'Europe',
  egypt: 'Africa',
  estonia: 'Europe',
  finland: 'Europe',
  france: 'Europe',
  germany: 'Europe',
  greece: 'Europe',
  hungary: 'Europe',
  india: 'Asia',
  indonesia: 'Asia',
  ireland: 'Europe',
  italy: 'Europe',
  japan: 'Asia',
  malaysia: 'Asia',
  mexico: 'North America',
  netherlands: 'Europe',
  'new zealand': 'Oceania',
  norway: 'Europe',
  philippines: 'Asia',
  poland: 'Europe',
  portugal: 'Europe',
  romania: 'Europe',
  serbia: 'Europe',
  singapore: 'Asia',
  slovakia: 'Europe',
  slovenia: 'Europe',
  'south africa': 'Africa',
  'south korea': 'Asia',
  spain: 'Europe',
  sweden: 'Europe',
  switzerland: 'Europe',
  thailand: 'Asia',
  turkey: 'Europe',
  uk: 'Europe',
  'united kingdom': 'Europe',
  usa: 'North America',
  us: 'North America',
  'united states': 'North America',
  'united states of america': 'North America',
  vietnam: 'Asia',
};

function normaliseCountry(country: string): string {
  return country.trim().toLowerCase();
}

function continentFor(country: string): string {
  if (!country.trim()) return 'Unknown';
  return COUNTRY_TO_CONTINENT[normaliseCountry(country)] ?? 'Unknown';
}

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
  const openTesterPanel = useDashboardStore((s) => s.openTesterPanel);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'outlier' | 'unmatched'>('all');

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

    const countryRows = distribution(countries, total).filter((row) => row.label !== 'Unknown');
    const continentRows = distribution(continents, total);
    const ageRows = distribution(ages, total);
    const hardwareRows = distribution(hardware, total);
    const gamerRows = distribution(gamerTypes, Math.max(gamerTypes.length, 1));
    const matchedProfiles = testers.filter((t) => t.email || t.discord || Object.keys(t.segments).length > 0).length;

    return {
      countryRows,
      continentRows,
      ageRows,
      hardwareRows,
      gamerRows,
      matchedProfiles,
      topCountry: countryRows[0]?.label ?? 'Unknown',
      topContinent: continentRows[0]?.label ?? 'Unknown',
    };
  }, [testers]);

  const visible = testers
    .filter((t) => {
      const q = search.toLowerCase();
      const matchSearch = !q || t.testerId.toLowerCase().includes(q) || t.email.toLowerCase().includes(q) || t.discord.toLowerCase().includes(q);
      const matchFilter =
        filter === 'all' ? true :
        filter === 'outlier' ? t.isOutlier :
        filter === 'unmatched' ? !t.email && !t.discord :
        true;
      return matchSearch && matchFilter;
    })
    .sort((a, b) => {
      const na = parseInt(a.testerId), nb = parseInt(b.testerId);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.testerId.localeCompare(b.testerId);
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
      <PageHeader title="Testers" sub={`${testers.length} testers · ${testers.filter((t) => t.isOutlier).length} flagged as outliers`} />

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

      {/* Controls */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            placeholder="Search by ID, email, or Discord…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg bg-slate-800/60 border border-slate-700 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/60 transition-colors"
          />
        </div>
        {(['all', 'outlier'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors border ${
              filter === f
                ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-300'
                : 'border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500'
            }`}
          >
            {f === 'all' ? 'All' : 'Outliers'}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-700/60 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700/60 bg-slate-800/40">
              {['Tester', 'Location', 'Gamer Type', 'Hours/wk', 'Avg Rating', ''].map((h) => (
                <th key={h} className="text-left text-xs text-slate-500 font-medium px-4 py-3 uppercase tracking-wide">{h}</th>
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
                      <div className="text-slate-200 font-medium">{formatTesterId(t.testerId)}</div>
                      <div className="text-xs text-slate-500 truncate max-w-[140px]">{t.email || t.discord}</div>
                    </div>
                    {t.isOutlier && <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />}
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
  );
}
