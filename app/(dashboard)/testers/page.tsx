'use client';
import { useState } from 'react';
import { Search, Star, AlertTriangle, Globe, Gamepad2, Clock } from 'lucide-react';
import { useDashboardStore, selectFilteredTesters } from '@/lib/store';
import PageHeader from '@/components/ui/PageHeader';
import EmptyState from '@/components/ui/EmptyState';
import { Users } from 'lucide-react';
import { formatTesterId } from '@/lib/utils';

export default function TestersPage() {
  const testers = useDashboardStore(selectFilteredTesters);
  const openTesterPanel = useDashboardStore((s) => s.openTesterPanel);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'outlier' | 'unmatched'>('all');

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
        <PageHeader title="Testers" sub="All registered playtesters" />
        <EmptyState icon={Users} title="No testers yet" />
      </div>
    );
  }

  return (
    <div className="px-8 py-8 max-w-5xl">
      <PageHeader title="Testers" sub={`${testers.length} testers · ${testers.filter((t) => t.isOutlier).length} flagged as outliers`} />

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
