'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Layers, HelpCircle, Sparkles,
  Users, Table2, Download, Settings, SlidersHorizontal, FolderTree, Database, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDashboardStore, selectActiveFilterCount } from '@/lib/store';
import CompanyLogo from '@/components/brand/CompanyLogo';

const NAV_SECTIONS = [
  {
    label: 'REPORT',
    items: [
      { href: '/overview',   label: 'Overview',   icon: LayoutDashboard },
      { href: '/categories', label: 'Categories', icon: Layers },
      { href: '/questions',  label: 'All Questions',  icon: HelpCircle },
      { href: '/testers',    label: 'Testers',    icon: Users },
      { href: '/builder',    label: 'Category Builder (Beta)', icon: FolderTree },
    ],
  },
  {
    label: 'DATA',
    items: [
      { href: '/responses', label: 'Responses', icon: Table2 },
      { href: '/export',    label: 'Export',    icon: Download },
    ],
  },
  {
    label: 'ADMIN',
    items: [
      { href: '/themes',   label: 'AI Analysis', icon: Sparkles },
      { href: '/registry', label: 'Tester Registry', icon: Database },
      { href: '/settings', label: 'Settings',    icon: Settings },
    ],
  },
];

export default function Sidebar() {
  const pathname         = usePathname();
  const activeFilterCount = useDashboardStore(selectActiveFilterCount);
  const mobileDrawer     = useDashboardStore((s) => s.mobileDrawer);
  const openMobileDrawer = useDashboardStore((s) => s.openMobileDrawer);
  const closeMobileDrawer = useDashboardStore((s) => s.closeMobileDrawer);

  const navOpen = mobileDrawer === 'nav';

  // Navigating on a phone/tablet should dismiss the overlay it was tapped in.
  useEffect(() => { closeMobileDrawer(); }, [pathname, closeMobileDrawer]);

  return (
    <aside
      className={cn(
        'fixed top-0 left-0 h-full w-[220px] bg-[#0d1220] border-r border-slate-800 flex flex-col',
        // Off-canvas below `lg`, permanently docked from `lg` up.
        'z-50 transition-transform duration-200 lg:z-40 lg:translate-x-0',
        navOpen ? 'translate-x-0 shadow-2xl shadow-black/50' : '-translate-x-full',
      )}
    >
      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-800 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-slate-800/40 border border-slate-700/60 flex items-center justify-center overflow-hidden">
            <CompanyLogo className="w-8" priority />
          </div>
          <div>
            <div className="font-display text-sm font-bold text-white leading-tight">Playlytix</div>
            <div className="text-xs text-slate-500 leading-tight">Insights</div>
          </div>
        </div>
        <button
          onClick={closeMobileDrawer}
          aria-label="Close navigation"
          className="lg:hidden w-8 h-8 -mr-1 rounded-md flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-5">
        {NAV_SECTIONS.map(({ label, items }) => (
          <div key={label}>
            <div className="px-3 mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-600">
              {label}
            </div>
            <div className="space-y-0.5">
              {items.map(({ href, label: itemLabel, icon: Icon }) => {
                const active = pathname === href || pathname.startsWith(href + '/');
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                      active
                        ? 'bg-indigo-600/20 text-indigo-300 font-medium'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60',
                    )}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    {itemLabel}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Below `lg` the filter rail is an overlay, so it still needs a trigger.
          From `lg` up there is no button here: the rail collapses into this nav
          and is reopened by the handle on the nav's edge (see DashboardShell). */}
      <div className="px-3 pb-3">
        <button
          onClick={() => openMobileDrawer('filters')}
          className={cn(
            'lg:hidden flex items-center justify-between w-full px-3 py-2 rounded-md text-sm transition-colors border',
            'border-slate-700/60 text-slate-400 hover:text-slate-200 hover:border-slate-600',
          )}
        >
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 flex-shrink-0" />
            <span>Filters</span>
          </div>
          {activeFilterCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full font-mono text-[10px] font-bold bg-indigo-600/30 text-indigo-300 border border-indigo-500/30">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* Upload new */}
      <div className="px-3 pb-4">
        <Link
          href="/upload"
          className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-md text-xs bg-indigo-600 hover:bg-indigo-500 text-white transition-colors font-medium"
        >
          Upload Excel
        </Link>
      </div>
    </aside>
  );
}
