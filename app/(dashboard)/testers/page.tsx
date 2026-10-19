'use client';
import { Suspense, useMemo, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useDashboardStore, selectFilteredResponses, selectFilteredTesters, selectGameConfig } from '@/lib/store';
import { geoSummary, isSteamLinked } from '@/lib/testerInsights';
import TesterOverviewTab from '@/components/testers/TesterOverviewTab';
import PlayersTab from '@/components/testers/PlayersTab';
import RosterTab from '@/components/testers/RosterTab';
import ov from '@/components/overview/overview.module.css';
import s from '@/components/testers/testers.module.css';

const TABS = [
  { key: 'roster', label: 'Roster' },
  { key: 'overview', label: 'Overview' },
  { key: 'players', label: 'Players' },
] as const;
type TabKey = typeof TABS[number]['key'];

const parseTab = (value: string | null): TabKey =>
  TABS.some(t => t.key === value) ? value as TabKey : 'roster';

/** "21 Sep – 3 Oct 2026": the year (and month) are only repeated when they change. */
function formatDateRange(start: Date, end: Date): string {
  const full = (x: Date) => x.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  if (start.toDateString() === end.toDateString()) return full(start);
  if (start.getFullYear() !== end.getFullYear()) return `${full(start)} – ${full(end)}`;
  if (start.getMonth() === end.getMonth()) return `${start.getDate()}–${full(end)}`;
  return `${start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${full(end)}`;
}

function TestersPageContent() {
  const testers = useDashboardStore(selectFilteredTesters);
  const responses = useDashboardStore(selectFilteredResponses);
  const questions = useDashboardStore(s => s.questions);
  const config = useDashboardStore(selectGameConfig);
  const targets = useDashboardStore(s => s.project?.steamMatchGenres);
  const params = useSearchParams();
  const pathname = usePathname();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const tab = parseTab(params.get('tab'));
  const search = params.get('search') ?? '';
  const filter = params.get('filter') ?? 'all';
  const setQuery = (key: string, value: string) => {
    const query = new URLSearchParams(params.toString());
    if (!value || value === 'all') query.delete(key); else query.set(key, value);
    window.history.replaceState(null, '', `${pathname}${query.size ? `?${query}` : ''}`);
  };
  // The profile page uses `tab` for its own tabs, so it is not carried over.
  const detailHref = (id: string) => {
    const query = new URLSearchParams(params.toString());
    query.delete('tab');
    return `${pathname}/${encodeURIComponent(id)}${query.size ? `?${query}` : ''}`;
  };

  const geo = useMemo(() => geoSummary(testers), [testers]);

  const meta = useMemo(() => {
    const linked = testers.filter(isSteamLinked).length;
    const times = responses.map(r => Date.parse(r.submittedAt)).filter(Number.isFinite);
    return [
      `${testers.length} ${testers.length === 1 ? 'response' : 'responses'}`,
      linked > 0 ? `${linked} Steam-linked` : null,
      times.length ? formatDateRange(new Date(Math.min(...times)), new Date(Math.max(...times))) : null,
    ].filter(Boolean).join(' · ');
  }, [testers, responses]);

  const selectTab = (key: TabKey) => setQuery('tab', key === 'roster' ? '' : key);
  const onTabKey = (e: React.KeyboardEvent, index: number) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : step ? (index + step + TABS.length) % TABS.length : -1;
    if (next < 0) return;
    e.preventDefault();
    selectTab(TABS[next].key);
    tabRefs.current[next]?.focus();
  };

  return (
    <div className={s.page}>
      <header className={s.header}>
        <div className={ov.breadcrumb}>Playlytix / Playtest results</div>
        <h1 className={ov.title}>
          Testers
        </h1>
        <div className={ov.meta}>{meta}</div>
      </header>

      {testers.length === 0 ? (
        <p className={`${s.mutedLine} groove-t`}>No testers in this cohort · 0 responses match the active filters</p>
      ) : (
        <>
          <div role="tablist" aria-label="Testers views" className={`${s.tabs} groove-b`}>
            {TABS.map((t, i) => (
              <button
                key={t.key}
                ref={el => { tabRefs.current[i] = el; }}
                type="button"
                role="tab"
                id={`testers-tab-${t.key}`}
                aria-selected={tab === t.key}
                aria-controls={`testers-panel-${t.key}`}
                tabIndex={tab === t.key ? 0 : -1}
                className={`${s.tab} ${tab === t.key ? s.tabActive : ''}`}
                onClick={() => selectTab(t.key)}
                onKeyDown={e => onTabKey(e, i)}
              >
                {t.label}
                {t.key === 'roster' && <span className={s.tabCount}>{testers.length}</span>}
              </button>
            ))}
          </div>

          <div role="tabpanel" id={`testers-panel-${tab}`} aria-labelledby={`testers-tab-${tab}`}>
            {tab === 'overview' && <TesterOverviewTab testers={testers} geo={geo} config={config} targets={targets} />}
            {tab === 'players' && <PlayersTab testers={testers} config={config} targets={targets} />}
            {tab === 'roster' && (
              <RosterTab
                testers={testers}
                responses={responses}
                questions={questions}
                config={config}
                targets={targets}
                search={search}
                filter={filter}
                onSearch={value => setQuery('search', value)}
                onFilter={value => setQuery('filter', value)}
                detailHref={detailHref}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function TestersPage() { return <Suspense><TestersPageContent /></Suspense>; }
