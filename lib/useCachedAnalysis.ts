'use client';
import { useCallback, useEffect, useRef } from 'react';
import { useDashboardStore } from './store';

interface Options<T> {
  /** Stable cache slot, e.g. 'overviewInsights'. */
  key: string;
  /**
   * Fingerprint of the exact inputs that will be sent to the model. A new
   * signature means a genuinely different question and a new paid request.
   * Pass an empty string while inputs aren't ready yet.
   */
  signature: string;
  /** Whether an auto-run is permitted right now (see the note on cost below). */
  auto: boolean;
  fetcher: () => Promise<T>;
}

interface Result<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** Force a run, ignoring a cached result or a previous failure. */
  run: () => void;
}

/**
 * Runs an AI analysis at most once per input signature and keeps the result in
 * the persisted store.
 *
 * The cache is what makes automatic execution safe. Without it an effect-driven
 * analysis would issue a fresh paid request on every mount, every navigation
 * back to the page, and in every duplicate tab. With it, a signature that has
 * already been answered is simply read back.
 *
 * A failed signature is never retried automatically — otherwise a persistent
 * error (missing API key, rate limit) becomes an endless billing loop. The user
 * retries deliberately via `run`.
 */
export function useCachedAnalysis<T>({ key, signature, auto, fetcher }: Options<T>): Result<T> {
  const entry = useDashboardStore((s) => s.aiCache[key]);
  const beginAiRun = useDashboardStore((s) => s.beginAiRun);
  const completeAiRun = useDashboardStore((s) => s.completeAiRun);
  const failAiRun = useDashboardStore((s) => s.failAiRun);

  const matches = entry?.signature === signature;

  // Keep `run` stable across renders even though `fetcher` closes over fresh
  // payload data each time, so the auto-run effect isn't re-triggered by it.
  // Synced in an effect (not during render) and declared before the auto-run
  // effect below, so the latest fetcher is in place before a run can start.
  const fetcherRef = useRef(fetcher);
  useEffect(() => { fetcherRef.current = fetcher; }, [fetcher]);

  // Guards a double-invoked effect (React StrictMode in dev) from firing two
  // requests before the first has written `running` to the store.
  const inFlightSignature = useRef<string | null>(null);

  const run = useCallback(() => {
    if (!signature) return;
    if (inFlightSignature.current === signature) return;
    inFlightSignature.current = signature;
    beginAiRun(key, signature);
    void (async () => {
      try {
        const data = await fetcherRef.current();
        completeAiRun(key, signature, data);
      } catch (err) {
        failAiRun(key, signature, err instanceof Error ? err.message : 'Analysis failed');
      } finally {
        if (inFlightSignature.current === signature) inFlightSignature.current = null;
      }
    })();
  }, [key, signature, beginAiRun, completeAiRun, failAiRun]);

  useEffect(() => {
    if (!auto || !signature) return;
    // Anything already answered, in flight, or failed for this signature is left alone.
    if (matches) return;
    run();
  }, [auto, signature, matches, run]);

  return {
    data: matches && entry?.status === 'done' ? (entry.data as T) : null,
    loading: matches && entry?.status === 'running',
    error: matches && entry?.status === 'error' ? (entry.error ?? 'Analysis failed') : null,
    run,
  };
}
