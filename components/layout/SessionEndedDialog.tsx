'use client';
import { useEffect, useRef } from 'react';
import { LockKeyhole } from 'lucide-react';

export type SessionEnd = 'expired' | 'replaced';

const COPY: Record<SessionEnd, { title: string; body: string }> = {
  expired: {
    title: 'Your session has expired',
    body: 'For security, sessions last two hours and this report has been closed.',
  },
  replaced: {
    title: 'This session was replaced',
    body: 'A newer Portal sign-in is active in this browser, so this report has been closed.',
  },
};

/**
 * Shown over the (blurred, already-cleared) dashboard when a Portal session
 * ends, instead of swapping the page for an error. It deliberately offers no
 * way onward: tests are only ever opened from the Portal.
 */
export default function SessionEndedDialog({ reason }: { reason: SessionEnd }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => { dialogRef.current?.focus(); }, []);
  const { title, body } = COPY[reason];
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="session-ended-title"
        aria-describedby="session-ended-body"
        className="w-full max-w-sm rounded-2xl border border-slate-700/70 bg-[#090f21] p-6 shadow-2xl shadow-black/70 focus:outline-none"
      >
        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600/20 text-indigo-300">
          <LockKeyhole className="h-5 w-5" />
        </div>
        <h2 id="session-ended-title" className="text-lg font-semibold text-white">{title}</h2>
        <div id="session-ended-body" className="mt-1.5 space-y-3 text-sm text-slate-400 leading-relaxed">
          <p>{body}</p>
          <p className="text-slate-200">Please close this tab and reopen your test from the Portal.</p>
        </div>
      </div>
    </div>
  );
}
