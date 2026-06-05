import { cn, severityColor } from '@/lib/utils';
import type { Severity, Priority } from '@/lib/types';

interface BadgeProps {
  label: string;
  variant?: 'severity' | 'type' | 'neutral' | 'accent';
  severity?: Severity | Priority;
  className?: string;
}

export default function Badge({ label, variant = 'neutral', severity, className }: BadgeProps) {
  if (variant === 'severity' && severity) {
    return (
      <span className={cn(
        'inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border',
        severityColor(severity),
        className,
      )}>
        {label}
      </span>
    );
  }

  if (variant === 'type') {
    return (
      <span className={cn(
        'inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full',
        'bg-slate-700/60 text-slate-300 border border-slate-600/50',
        className,
      )}>
        {label}
      </span>
    );
  }

  if (variant === 'accent') {
    return (
      <span className={cn(
        'inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full',
        'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30',
        className,
      )}>
        {label}
      </span>
    );
  }

  return (
    <span className={cn(
      'inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full',
      'bg-slate-800 text-slate-400 border border-slate-700',
      className,
    )}>
      {label}
    </span>
  );
}
