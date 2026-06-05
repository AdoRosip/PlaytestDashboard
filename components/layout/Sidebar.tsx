'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Layers, HelpCircle, Sparkles,
  Users, Table2, Download, Settings, Gamepad2, SlidersHorizontal,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDashboardStore, selectActiveFilterCount } from '@/lib/store';

const NAV_SECTIONS = [
  {
    label: 'REPORT',
    items: [
      { href: '/overview',   label: 'Overview',   icon: LayoutDashboard },
      { href: '/categories', label: 'Categories', icon: Layers },
      { href: '/questions',  label: 'Questions',  icon: HelpCircle },
      { href: '/testers',    label: 'Testers',    icon: Users },
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
      { href: '/settings', label: 'Settings',    icon: Settings },
    ],
  },
];

export default function Sidebar() {
  const pathname         = usePathname();
  const filterPanelOpen  = useDashboardStore((s) => s.filterPanelOpen);
  const toggleFilterPanel = useDashboardStore((s) => s.toggleFilterPanel);
  const activeFilterCount = useDashboardStore(selectActiveFilterCount);

  return (
    <aside className="fixed top-0 left-0 h-full w-[220px] bg-[#0d1220] border-r border-slate-800 flex flex-col z-40">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
            <Gamepad2 className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="text-sm font-semibold text-white leading-tight">Playtest</div>
            <div className="text-xs text-slate-500 leading-tight">Insights</div>
          </div>
        </div>
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

      {/* Filters toggle */}
      <div className="px-3 pb-3">
        <button
          onClick={toggleFilterPanel}
          className={cn(
            'flex items-center justify-between w-full px-3 py-2 rounded-md text-sm transition-colors border',
            filterPanelOpen
              ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-300'
              : 'border-slate-700/60 text-slate-400 hover:text-slate-200 hover:border-slate-600',
          )}
        >
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 flex-shrink-0" />
            <span>Filters</span>
          </div>
          {activeFilterCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-600/30 text-indigo-300 border border-indigo-500/30">
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
