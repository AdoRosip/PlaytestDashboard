'use client';
import { use, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { useDashboardStore } from '@/lib/store';
import { GAME_LIST, resolveGameConfigForTestName } from '@/lib/games';
import { mapPlaylytixTestToParseResult } from '@/lib/playlytix/mapper';
import { enrichTestersFromRegistry } from '@/lib/registryMatch';
import type { PlaylytixTestResponsesPayload } from '@/lib/playlytix/types';
import CompanyLogo from '@/components/brand/CompanyLogo';

type Status = 'loading' | 'ready' | 'error';

// Friendly fallbacks for when our own proxy route (app/api/playlytix/tests/[id])
// returns an error body without a usable `error` message.
const STATUS_FALLBACK: Record<number, string> = {
  400: 'That test id is not valid.',
  401: "This deployment's Playlytix API key was rejected — check PLAYLYTIX_API_KEY.",
  404: "Test not found. It may have been deleted, or the link's id is wrong.",
  502: "Couldn't reach the Playlytix API. Check your connection and try again.",
  503: 'The Playlytix API key is not configured on this deployment yet.',
};

export default function TestByIdPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  // Keyed by id so navigating between two /tests/:id links (same page instance
  // in Next's eyes) fully remounts and resets state, instead of needing manual
  // setState resets at the top of the fetch effect.
  return <TestByIdContent key={id} id={id} />;
}

function TestByIdContent({ id }: { id: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const loadFromExcel = useDashboardStore((s) => s.loadFromExcel);

  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState('');
  const [payload, setPayload] = useState<PlaylytixTestResponsesPayload | null>(null);
  const [gameOverride, setGameOverride] = useState<string | null>(searchParams.get('game'));
  const [warnings, setWarnings] = useState<string[]>([]);

  // Fetch the raw payload once per test id. Our route holds the API key
  // server-side — the browser only ever talks to our own /api/playlytix/*.
  useEffect(() => {
    let cancelled = false;

    fetch(`/api/playlytix/tests/${id}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error((body as { error?: string }).error ?? STATUS_FALLBACK[res.status] ?? `HTTP ${res.status}`);
        }
        return body as PlaylytixTestResponsesPayload;
      })
      .then((data) => { if (!cancelled) setPayload(data); })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load test data.');
        setStatus('error');
      });

    return () => { cancelled = true; };
  }, [id]);

  // The API has no game concept — guess from the test name, or use the ?game=
  // override / manual picker below. Re-runs instantly on override change since
  // it only touches the payload we already have, no refetch needed.
  const resolvedGame = useMemo(() => {
    if (!payload) return null;
    return resolveGameConfigForTestName(payload.test.TestName, gameOverride);
  }, [payload, gameOverride]);

  // Map -> enrich against the tester registry -> load into the store.
  useEffect(() => {
    if (!payload || !resolvedGame) return;
    let cancelled = false;
    (async () => {
      const mapped = mapPlaylytixTestToParseResult(payload, resolvedGame.config);
      const { result: enriched, warning } = await enrichTestersFromRegistry(mapped);
      if (cancelled) return;
      setWarnings(warning ? [...enriched.warnings, warning] : enriched.warnings);
      loadFromExcel(enriched);
      setStatus('ready');
    })();
    return () => { cancelled = true; };
  }, [payload, resolvedGame, loadFromExcel]);

  useEffect(() => {
    if (status !== 'ready') return;
    const t = setTimeout(() => router.push('/overview'), 1200);
    return () => clearTimeout(t);
  }, [status, router]);

  return (
    <div className="min-h-screen bg-[#0b0f19] flex flex-col items-center justify-center px-4">
      <div className="flex flex-col items-center gap-3 mb-10 text-center">
        <CompanyLogo glow className="w-24" priority />
        <div>
          <div className="text-lg font-semibold text-white">Playlytix</div>
          <div className="text-xs text-slate-400">Interactive feedback analysis for game studios</div>
        </div>
      </div>

      <div className="w-full max-w-lg">
        <div className="flex flex-col items-center justify-center w-full min-h-52 rounded-2xl border-2 border-dashed border-slate-700 bg-slate-800/30 px-6 py-8">
          {status === 'loading' && (
            <>
              <div className="w-12 h-12 rounded-full bg-indigo-500/20 flex items-center justify-center mb-3">
                <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
              </div>
              <div className="text-sm text-slate-300">Fetching test #{id} from Playlytix…</div>
              <div className="text-xs text-slate-500 mt-1">Questions, responses, and tester profiles</div>
            </>
          )}

          {status === 'ready' && (
            <>
              <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mb-3">
                <CheckCircle2 className="w-6 h-6 text-green-400" />
              </div>
              <div className="text-sm text-green-300 font-medium">
                Loaded {payload?.test.TestName ?? `test #${id}`}
              </div>
              <div className="text-xs text-slate-400 mt-1">Redirecting to dashboard…</div>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mb-3">
                <AlertCircle className="w-6 h-6 text-red-400" />
              </div>
              <div className="text-sm text-red-300 font-medium">Couldn&apos;t load this test</div>
              <div className="text-xs text-slate-400 mt-1 text-center max-w-sm">{error}</div>
              <Link
                href="/upload"
                className="mt-4 text-xs text-indigo-400 hover:text-indigo-300 underline underline-offset-2"
              >
                Upload a file manually instead
              </Link>
            </>
          )}
        </div>

        {/* Game detection + manual override — the Playlytix API has no game field,
            so this is a best-effort guess from the test name. */}
        {payload && resolvedGame && (
          <div className="mt-4">
            <div className="text-xs text-slate-500 mb-2">
              {resolvedGame.matchedBy === 'default'
                ? "Couldn't detect the game from the test name — defaulted below. Pick the right one:"
                : 'Detected game (change if wrong):'}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {GAME_LIST.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setGameOverride(g.id)}
                  className={`py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                    resolvedGame.config.id === g.id
                      ? 'border-indigo-400 bg-indigo-500/10 text-white'
                      : 'border-slate-700 bg-slate-800/40 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  {g.gameName}
                </button>
              ))}
            </div>
          </div>
        )}

        {warnings.length > 0 && (
          <div className="mt-4 rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4 space-y-1">
            {warnings.map((w, i) => (
              <div key={i} className="flex items-start gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0 mt-0.5" />
                <span className="text-xs text-yellow-300">{w}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
