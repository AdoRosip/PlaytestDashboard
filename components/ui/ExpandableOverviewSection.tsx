'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, X } from 'lucide-react';

interface Props {
  title: string;
  children: ReactNode;
  className?: string;
}

/**
 * Keeps an overview section compact in the report, then moves the same React
 * content into a larger dialog on demand. Nothing is duplicated, so links,
 * charts, filters, and live loading states behave exactly as they do inline.
 */
export default function ExpandableOverviewSection({ title, children, className = '' }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [placeholderHeight, setPlaceholderHeight] = useState(0);
  const titleId = useId();
  const expandButtonId = `${titleId}-expand`;
  const inlineRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const open = () => {
    setPlaceholderHeight(inlineRef.current?.offsetHeight ?? 0);
    setExpanded(true);
  };

  const close = () => setExpanded(false);

  useEffect(() => {
    if (!expanded) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      requestAnimationFrame(() => document.getElementById(expandButtonId)?.focus());
    };
  }, [expanded, expandButtonId]);

  if (expanded) {
    return (
      <>
        <div style={{ height: placeholderHeight }} aria-hidden="true" />
        {createPortal(
          <>
            <button
              type="button"
              aria-label={`Close enlarged ${title}`}
              className="fixed inset-0 z-[90] cursor-default bg-black/75 backdrop-blur-sm"
              onClick={close}
            />
            <div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              className="fixed left-1/2 top-[4vh] z-[100] flex h-[92vh] w-[94vw] max-w-[1500px] -translate-x-1/2 flex-col overflow-hidden rounded-2xl border border-slate-600/70 bg-[#090f21] shadow-2xl shadow-black/70"
            >
              <div className="flex flex-shrink-0 items-center justify-between gap-4 border-b border-slate-700/70 bg-[#0d1429] px-5 py-4 sm:px-7">
                <div>
                  <div className="mb-0.5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-indigo-400">
                    <Maximize2 className="h-3 w-3" /> Enlarged section
                  </div>
                  <h2 id={titleId} className="text-lg font-semibold text-white">{title}</h2>
                </div>
                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={close}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 text-slate-400 transition-colors hover:border-slate-500 hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-indigo-400/70"
                  aria-label={`Close enlarged ${title}`}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="overview-expanded-content min-h-0 flex-1 overflow-y-auto p-5 sm:p-7 lg:p-9">
                {children}
              </div>
            </div>
          </>,
          document.body,
        )}
      </>
    );
  }

  return (
    <div ref={inlineRef} className={`group/overview-expand relative flow-root ${className}`}>
      {children}
      <button
        id={expandButtonId}
        type="button"
        onClick={open}
        className="absolute -right-2 -top-2 z-10 flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700/80 bg-[#0d1429]/95 text-slate-400 opacity-75 shadow-lg shadow-black/20 transition-all hover:border-indigo-400/60 hover:text-indigo-300 hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-indigo-400/70"
        aria-label={`Enlarge ${title}`}
        title={`Enlarge ${title}`}
      >
        <Maximize2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
