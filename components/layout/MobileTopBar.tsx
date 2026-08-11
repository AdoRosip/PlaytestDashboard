'use client';
import { Menu, SlidersHorizontal } from 'lucide-react';
import { useDashboardStore, selectActiveFilterCount } from '@/lib/store';
import CompanyLogo from '@/components/brand/CompanyLogo';

/**
 * Fixed header shown only below `lg`, where the nav and filter rails are
 * off-canvas. It carries the two triggers that open them plus the active-filter
 * count, so the filtered-cohort warning is never hidden behind a closed panel.
 */
export default function MobileTopBar() {
  const openMobileDrawer  = useDashboardStore((s) => s.openMobileDrawer);
  const activeFilterCount = useDashboardStore(selectActiveFilterCount);
  const project           = useDashboardStore((s) => s.project);

  return (
    <header className="lg:hidden fixed top-0 left-0 right-0 h-14 z-30 flex items-center gap-2 px-3 bg-[#0d1220] border-b border-slate-800">
      <button
        onClick={() => openMobileDrawer('nav')}
        aria-label="Open navigation"
        className="w-10 h-10 rounded-md flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
      >
        <Menu className="w-5 h-5" />
      </button>

      <div className="flex items-center gap-2 min-w-0 flex-1">
        <CompanyLogo className="w-6 flex-shrink-0" priority />
        <span className="text-sm font-semibold text-white truncate">
          {project?.gameName || project?.name || 'Playlytix'}
        </span>
      </div>

      <button
        onClick={() => openMobileDrawer('filters')}
        aria-label="Open filters"
        className="relative w-10 h-10 rounded-md flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
      >
        <SlidersHorizontal className="w-5 h-5" />
        {activeFilterCount > 0 && (
          <span className="absolute top-1 right-1 min-w-4 h-4 px-1 rounded-full text-[10px] font-bold leading-4 text-center bg-indigo-600 text-white">
            {activeFilterCount}
          </span>
        )}
      </button>
    </header>
  );
}
