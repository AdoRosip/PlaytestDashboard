'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useDashboardStore } from '@/lib/store';

type Session = { clientId: string; sid: string; expiresAt: number };
function clearDataset() {
  useDashboardStore.getState().loadFromExcel({ project: { id: '', name: '', gameName: '', playtestName: '', createdAt: '', totalResponses: 0, matchedTesters: 0, unmatchedTesters: 0 }, testers: [], categories: [], questions: [], responses: [] });
  useDashboardStore.setState({ project: null, isLoaded: false, mobileDrawer: null });
}
export default function PortalBoundary({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  const pathname = usePathname();
  const testId = pathname.match(/^\/tests\/([1-9]\d*)\//)?.[1];
  const entry = pathname === '/portal-entry';
  const [view, setView] = useState<{ ready?: string; error?: string; tests?: { id: number; name: string }[]; warnings?: string[]; count?: number }>({});
  useEffect(() => {
    if (!enabled || entry) return;
    let active = true;
    let session: Session | undefined;
    const controller = new AbortController();
    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('portal-session') : null;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    clearDataset();
    const invalidate = () => {
      if (!active) return;
      active = false; controller.abort(); clearDataset();
      setView({ error: 'Your session changed or expired. Open the test again from the Portal.' });
    };
    const getSession = async (): Promise<Session> => {
      const r = await fetch('/api/portal/session', { cache: 'no-store', signal: controller.signal });
      if (!r.ok) throw new Error('Session expired. Open the dashboard from the Portal.');
      return r.json();
    };
    const check = async () => {
      if (!session || !active) return;
      try { if ((await getSession()).sid !== session.sid) invalidate(); } catch { invalidate(); }
    };
    channel?.addEventListener('message', event => { if (session && event.data !== session.sid) invalidate(); });
    const visibility = () => {
      if (document.visibilityState === 'hidden') invalidate();
      else window.location.reload();
    };
    const pageshow = (event: PageTransitionEvent) => { if (event.persisted) window.location.reload(); };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('focus', check); window.addEventListener('pageshow', pageshow);
    const interval = setInterval(check, 15000);
    (async () => {
      try {
        session = await getSession(); channel?.postMessage(session.sid);
        expiry = setTimeout(invalidate, Math.max(0, session.expiresAt * 1000 - Date.now()));
        const r = await fetch(testId ? `/api/portal/tests/${testId}` : '/api/portal/tests', {
          cache: 'no-store', headers: { 'x-portal-session': session.sid }, signal: controller.signal,
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Unable to load test.');
        if ((await getSession()).sid !== session.sid) { invalidate(); return; }
        if (!active) return;
        if (testId) {
          useDashboardStore.getState().loadFromExcel(data);
          setView({ ready: testId, warnings: data.warnings, count: data.testers.length });
        } else setView({ tests: data.tests });
      } catch (error) {
        if (active) { clearDataset(); setView({ error: error instanceof Error ? error.message : 'Unable to load test.' }); }
      }
    })();
    return () => {
      active = false; controller.abort(); channel?.close(); clearTimeout(expiry); clearInterval(interval);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('focus', check); window.removeEventListener('pageshow', pageshow); clearDataset();
    };
  }, [enabled, entry, testId]);
  if (!enabled || entry) return children;
  const logout = async () => {
    clearDataset(); setView({ error: 'Signed out.' });
    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('portal-session') : null;
    channel?.postMessage('logout'); channel?.close();
    await fetch('/api/portal/session', { method: 'DELETE' }); window.location.assign('/portal-entry');
  };
  return <div>
    <div className="relative z-[60] flex gap-5 items-center bg-slate-900 p-3 text-sm"><button onClick={() => window.location.assign('/tests')}>All playtests</button><button onClick={logout}>Sign out</button></div>
    {view.error ? <div className="p-12" role="alert">{view.error} <button onClick={() => window.location.assign('/tests')} className="underline">Return to playtests</button></div>
      : !testId && view.tests ? <main className="p-12"><h1 className="text-2xl mb-6">Your playtests</h1>{view.tests.length ? view.tests.map(t => <a className="block py-3 underline" href={`/tests/${t.id}/overview`} key={t.id}>{t.name}</a>) : <p>No playtests are available for this client.</p>}</main>
      : view.ready === testId && testId ? <><div className="lg:ml-[220px] p-4 text-xs text-slate-400">{view.warnings?.map(w => <p key={w}>{w}</p>)}<p>{view.count} submissions received.</p></div>{children}</>
      : <p className="p-12">Loading your playtest…</p>}
  </div>;
}
