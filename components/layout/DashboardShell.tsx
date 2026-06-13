'use client';
import { useEffect } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import Sidebar from './Sidebar';
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
  const totalParticipants = useDashboardStore((s) => countRespondents(s.responses));
  const filteredParticipants = useDashboardStore((s) => countRespondents(selectFilteredResponses(s)));

  useEffect(() => {
    if (!isLoaded) loadMockData();
  }, [isLoaded, loadMockData]);

  const mainMargin = filterPanelOpen ? 'ml-[480px]' : 'ml-[220px]';

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      {filterPanelOpen && <FilterPanel />}
      <main className={`flex-1 ${mainMargin} min-h-screen transition-all duration-200`}>
        {/* Active filter banner */}
        {activeFilterCount > 0 && (
          <div className="flex items-center gap-2 px-6 py-2 bg-indigo-900/20 border-b border-indigo-700/30">
            <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
            <span className="text-xs text-indigo-300">
              Showing <span className="font-semibold">{filteredParticipants}</span> of {totalParticipants} participants
              {' '}· {activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''} active
            </span>
            <button
              onClick={clearFilters}
              className="ml-auto flex items-center gap-1 text-xs text-indigo-400 hover:text-white transition-colors"
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
