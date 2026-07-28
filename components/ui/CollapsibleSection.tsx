'use client';

import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

interface CollapsibleSectionProps {
  title: string;
  description?: string;
  meta?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  contentClassName?: string;
}

export default function CollapsibleSection({
  title,
  description,
  meta,
  children,
  defaultOpen = true,
  className = '',
  contentClassName = 'px-5 pb-5',
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();

  return (
    <section className={`rounded-xl border border-slate-700/60 bg-slate-800/20 ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls={contentId}
        className="flex w-full items-center justify-between gap-4 rounded-xl px-5 py-4 text-left transition-colors hover:bg-slate-800/30"
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-white">{title}</span>
          {description && <span className="mt-0.5 block text-xs text-slate-400">{description}</span>}
        </span>
        <span className="flex flex-shrink-0 items-center gap-3">
          {meta}
          <ChevronDown
            className={`h-4 w-4 text-slate-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          />
        </span>
      </button>

      {open && (
        <div id={contentId} className={contentClassName}>
          {children}
        </div>
      )}
    </section>
  );
}
