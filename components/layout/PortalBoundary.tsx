'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useDashboardStore } from '@/lib/store';
import PortalLoader, { type LoadState } from './PortalLoader';
import SessionEndedDialog, { type SessionEnd } from './SessionEndedDialog';

type Session = { clientId: string; sid: string; expiresAt: number };
function clearDataset() {
  useDashboardStore.getState().clearDataset();
}
export default function PortalBoundary({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  const pathname = usePathname();
  const testId = pathname.match(/^\/tests\/([1-9]\d*)\//)?.[1];
  const entry = pathname === '/portal-entry';
  const [view, setView] = useState<{ ready?: string; error?: string; tests?: { id: number; name: string }[] }>({});
  // Keyed by test so a previous test's outcome never shows on the next one.
  const [load, setLoad] = useState<LoadState & { testId?: string }>({});
  const [ended, setEnded] = useState<SessionEnd>();
  useEffect(() => {
    if (!enabled || entry) return;
    let active = true;
    let session: Session | undefined;
    const controller = new AbortController();
    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('portal-session') : null;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    let opening: ReturnType<typeof setTimeout> | undefined;
    const updateLoad = (next: Partial<LoadState>) => {
      if (active && testId) setLoad(l => ({ ...(l.testId === testId ? l : {}), ...next, testId }));
    };
    clearDataset();
    const invalidate = (reason: SessionEnd) => {
      if (!active) return;
      active = false; controller.abort(); clearDataset();
      setEnded(reason);
    };
    const getSession = async (): Promise<Session> => {
      const r = await fetch('/api/portal/session', { cache: 'no-store', signal: controller.signal });
      if (!r.ok) throw new Error('Session expired. Open the dashboard from the Portal.');
      return r.json();
    };
    const check = async () => {
      if (!session || !active) return;
      let current: Session;
      try { current = await getSession(); } catch (error) {
        // A network failure (e.g. waking from sleep) is not proof the session
        // ended — the next focus or interval check will try again.
        if (error instanceof TypeError || controller.signal.aborted) return;
        invalidate('expired'); return;
      }
      if (current.sid !== session.sid) invalidate('replaced');
    };
    channel?.addEventListener('message', event => { if (session && event.data !== session.sid) invalidate('replaced'); });
    // Returning to the tab revalidates quietly; the report stays on screen.
    const visibility = () => { if (document.visibilityState === 'visible') void check(); };
    const pageshow = (event: PageTransitionEvent) => { if (event.persisted) window.location.reload(); };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('focus', check); window.addEventListener('pageshow', pageshow);
    const interval = setInterval(check, 15000);
    (async () => {
      try {
        session = await getSession(); channel?.postMessage(session.sid);
        expiry = setTimeout(() => invalidate('expired'), Math.max(0, session.expiresAt * 1000 - Date.now()));
        const r = await fetch(testId ? `/api/portal/tests/${testId}` : '/api/portal/tests', {
          cache: 'no-store', headers: { 'x-portal-session': session.sid }, signal: controller.signal,
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || 'Unable to load test.');
        updateLoad({ testName: data.project?.name });
        if ((await getSession()).sid !== session.sid) { invalidate('replaced'); return; }
        if (!active) return;
        if (testId) {
          useDashboardStore.getState().loadDataset(data);
          updateLoad({ done: true });
          // Hold the full bar briefly so "Opening dashboard" is visible.
          opening = setTimeout(() => setView({ ready: testId }), 600);
        } else setView({ tests: data.tests });
      } catch (error) {
        if (!active) return;
        clearDataset();
        const message = error instanceof Error ? error.message : 'Unable to load test.';
        if (testId) updateLoad({ failed: message });
        else setView({ error: message });
      }
    })();
    return () => {
      active = false; controller.abort(); channel?.close(); clearTimeout(expiry); clearTimeout(opening); clearInterval(interval);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('focus', check); window.removeEventListener('pageshow', pageshow); clearDataset();
    };
  }, [enabled, entry, testId]);
  if (!enabled || entry) return children;
  return <div>
    <div inert={Boolean(ended)} className={ended ? 'blur-sm select-none' : undefined}>
    {view.error ? <div className="p-12" role="alert">{view.error} <button onClick={() => window.location.assign('/tests')} className="underline">Return to playtests</button></div>
      : !testId && view.tests ? <main className="p-12"><h1 className="text-2xl mb-6">Your playtests</h1>{view.tests.length ? view.tests.map(t => <a className="block py-3 underline" href={`/tests/${t.id}/overview`} key={t.id}>{t.name}</a>) : <p>No playtests are available for this client.</p>}</main>
      : view.ready === testId && testId ? children
      : testId ? <PortalLoader key={testId} state={load.testId === testId ? load : {}} onRetry={() => window.location.reload()} />
      : <p className="p-12">Loading your playtests…</p>}
    </div>
    {ended && <SessionEndedDialog reason={ended} />}
  </div>;
}
