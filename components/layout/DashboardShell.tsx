'use client';
import { useEffect } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import Sidebar from './Sidebar';
import MobileTopBar from './MobileTopBar';
import FilterPanel from '@/components/filters/FilterPanel';
import { useDashboardStore, selectFilteredResponses, selectActiveFilterCount } from '@/lib/store';
import EvidenceDrawer from '@/components/ui/EvidenceDrawer';
import TesterPanel from '@/components/ui/TesterPanel';
import { countRespondents } from '@/lib/responseStats';

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const loadMockData      = useDashboardStore((s) => s.loadMockData);
  const isLoaded          = useDashboardStore((s) => s.isLoaded);
  const filterPanelOpen   = useDashboardStore((s) => s.filterPanelOpen);
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

      {/* Docked filter rail — `lg` and up only. */}
      {filterPanelOpen && (
        <div className="hidden lg:flex fixed left-[220px] top-0 h-full w-[260px] border-r border-slate-800 z-30">
          <FilterPanel />
        </div>
      )}

      {/* Off-canvas filter rail — below `lg`. Mounted always so it can animate. */}
      <div
        className={`lg:hidden fixed left-0 top-0 h-full w-[300px] max-w-[85vw] border-r border-slate-800 z-50 transition-transform duration-200 ${
          mobileDrawer === 'filters' ? 'translate-x-0 shadow-2xl shadow-black/50' : '-translate-x-full'
        }`}
      >
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
        {/* Active filter banner */}
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
        {children}
      </main>

      <EvidenceDrawer />
      <TesterPanel />
    </div>
  );
}
