import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface KpiCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon?: LucideIcon;
  accent?: 'indigo' | 'green' | 'yellow' | 'red' | 'slate';
  trend?: 'up' | 'down' | 'neutral';
}

const accentMap = {
  indigo: 'border-indigo-500/30 bg-indigo-500/5',
  green:  'border-green-500/30  bg-green-500/5',
  yellow: 'border-yellow-500/30 bg-yellow-500/5',
  red:    'border-red-500/30    bg-red-500/5',
  slate:  'border-slate-700     bg-slate-800/40',
};

const iconAccent = {
  indigo: 'text-indigo-400 bg-indigo-500/15',
  green:  'text-green-400  bg-green-500/15',
  yellow: 'text-yellow-400 bg-yellow-500/15',
  red:    'text-red-400    bg-red-500/15',
  slate:  'text-slate-400  bg-slate-700/40',
};

export default function KpiCard({ label, value, sub, icon: Icon, accent = 'slate' }: KpiCardProps) {
  return (
    <div className={cn(
      'rounded-xl border p-4 flex flex-col gap-2',
      accentMap[accent],
    )}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400 font-medium uppercase tracking-wide">{label}</span>
        {Icon && (
          <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', iconAccent[accent])}>
            <Icon className="w-3.5 h-3.5" />
          </div>
        )}
      </div>
      <div className="text-2xl font-bold text-white leading-none">{value}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  );
}
