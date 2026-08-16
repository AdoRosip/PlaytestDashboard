'use client';
import { useEffect } from 'react';
import { ChevronRight, SlidersHorizontal, X } from 'lucide-react';
import Sidebar from './Sidebar';
import MobileTopBar from './MobileTopBar';
import FilterPanel from '@/components/filters/FilterPanel';
import CrossFilterBar from '@/components/filters/CrossFilterBar';
import { useDashboardStore, selectFilteredResponses, selectActiveFilterCount } from '@/lib/store';
import EvidenceDrawer from '@/components/ui/EvidenceDrawer';
import TesterPanel from '@/components/ui/TesterPanel';
import { countRespondents } from '@/lib/responseStats';

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const loadMockData      = useDashboardStore((s) => s.loadMockData);
  const isLoaded          = useDashboardStore((s) => s.isLoaded);
  const filterPanelOpen   = useDashboardStore((s) => s.filterPanelOpen);
  const toggleFilterPanel = useDashboardStore((s) => s.toggleFilterPanel);
  const clearFilters      = useDashboardStore((s) => s.clearFilters);
  const activeFilterCount = useDashboardStore(selectActiveFilterCount);
  const mobileDrawer      = useDashboardStore((s) => s.mobileDrawer);
  const closeMobileDrawer = useDashboardStore((s) => s.closeMobileDrawer);
  const totalParticipants = useDashboardStore((s) => countRespondents(s.responses));
  const filteredParticipants = useDashboardStore((s) => countRespondents(selectFilteredResponses(s)));

  useEffect(() => {
    if (!isLoaded) loadMockData();
  }, [isLoaded, loadMockData]);

  // Escape closes whichever overlay is open.
  useEffect(() => {
    if (mobileDrawer === null) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeMobileDrawer(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileDrawer, closeMobileDrawer]);

  // Below `lg` both rails are off-canvas, so content is full-width. From `lg`
  // the nav is always docked and the filter panel optionally widens the offset.
  const mainOffset = filterPanelOpen ? 'lg:ml-[480px]' : 'lg:ml-[220px]';

  return (
    <div className="flex min-h-screen">
      <MobileTopBar />
      <Sidebar />

      {/* Docked filter rail — `lg` and up only.
          Always mounted and slid out of view rather than unmounted, so it can
          animate. Collapsing translates it a full width left, which tucks it
          behind the nav (rail z-30, nav z-40) — it literally slides into the nav
          instead of blinking out. `inert` keeps its controls out of the tab order
          and off screen readers while hidden. */}
      <div
        className={`hidden lg:flex fixed left-[220px] top-0 h-full w-[260px] border-r border-slate-800 z-30 transition-transform duration-200 ${
          filterPanelOpen ? 'translate-x-0' : '-translate-x-[260px]'
        }`}
        inert={!filterPanelOpen}
      >
        <FilterPanel />
      </div>

      {/* Expand handle — a tab on the nav's edge, shown only while collapsed.
          `top-3` lines its centre up with the collapse chevron inside the panel
          header (which sits in a `py-4` row), so the control does not appear to
          jump vertically as the rail opens and closes. */}
      {!filterPanelOpen && (
        <button
          onClick={toggleFilterPanel}
          aria-label="Expand filters"
          aria-expanded={false}
          title="Expand filters"
          className="hidden lg:flex fixed left-[220px] top-3 z-40 items-center gap-1.5 py-1.5 pl-1.5 pr-2.5 rounded-r-lg border border-l-0 border-slate-700/60 bg-[#0d1220] text-slate-400 hover:text-white hover:border-slate-500 transition-colors"
        >
          <ChevronRight className="w-4 h-4 flex-shrink-0" />
          <SlidersHorizontal className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="text-xs font-medium">Filters</span>
          {activeFilterCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full font-mono text-[10px] font-bold bg-indigo-600/30 text-indigo-300 border border-indigo-500/30">
              {activeFilterCount}
            </span>
          )}
        </button>
      )}

      {/* Off-canvas filter rail — below `lg`. Mounted always so it can animate. */}
      <div
        className={`lg:hidden fixed left-0 top-0 h-full w-[300px] max-w-[85vw] border-r border-slate-800 z-50 transition-transform duration-200 ${
          mobileDrawer === 'filters' ? 'translate-x-0 shadow-2xl shadow-black/50' : '-translate-x-full'
        }`}
      >
        <span className=''>Filters</span>
        <FilterPanel />
      </div>

      {/* Shared backdrop for whichever rail is open below `lg`. */}
      {mobileDrawer !== null && (
        <div
          className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
          onClick={closeMobileDrawer}
          aria-hidden="true"
        />
      )}

      <main className={`flex-1 ${mainOffset} min-w-0 min-h-screen pt-14 lg:pt-0 transition-all duration-200`}>
        {/* Active-cohort banners. Pinned while scrolling so the reason the
            numbers below are small never scrolls out of sight — item 19 asks for
            the active filter to stay visibly highlighted. `top-14` clears the
            fixed MobileTopBar; from `lg` that bar is gone and the rails are
            docked, so it sits at the very top. */}
        <div className="sticky top-14 lg:top-0 z-20 bg-[#0B1021]">
          {/* Filter panel — demographics, sentiment, data quality */}
          {activeFilterCount > 0 && (
            <div className="flex items-center gap-2 px-4 md:px-6 py-2 bg-indigo-900/20 border-b border-indigo-700/30">
              <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
              <span className="text-xs text-indigo-300 min-w-0">
                Showing <span className="font-semibold">{filteredParticipants}</span> of {totalParticipants} participants
                {' '}· {activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''} active
              </span>
              <button
                onClick={clearFilters}
                className="ml-auto flex items-center gap-1 text-xs text-indigo-400 hover:text-white transition-colors flex-shrink-0"
              >
                <X className="w-3 h-3" /> Clear
              </button>
            </div>
          )}
          {/* Cross-filter — answers clicked on charts, carried across pages */}
          <CrossFilterBar />
        </div>
        {children}
      </main>

      <EvidenceDrawer />
      <TesterPanel />
    </div>
  );
}
