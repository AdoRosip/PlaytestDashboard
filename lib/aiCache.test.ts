import { beforeEach, describe, expect, it } from 'vitest';
import { useDashboardStore } from './store';

// The AI result cache is what makes automatic analysis safe: it is the only
// thing stopping an effect-driven run from buying a fresh paid request on every
// mount, filter change and duplicate tab. These tests pin that behaviour.

const KEY = 'overviewInsights';

function reset() {
  useDashboardStore.setState({ aiCache: {} });
}

describe('AI result cache', () => {
  beforeEach(reset);

  it('marks a run as running, then stores the result under its signature', () => {
    const { beginAiRun, completeAiRun } = useDashboardStore.getState();

    beginAiRun(KEY, 'sig-a');
    expect(useDashboardStore.getState().aiCache[KEY]).toMatchObject({
      signature: 'sig-a',
      status: 'running',
    });

    completeAiRun(KEY, 'sig-a', { strengths: [] });
    const entry = useDashboardStore.getState().aiCache[KEY];
    expect(entry.status).toBe('done');
    expect(entry.data).toEqual({ strengths: [] });
  });

  it('ignores a result from a superseded run', () => {
    const { beginAiRun, completeAiRun } = useDashboardStore.getState();

    // First run starts, then the inputs change and a second run supersedes it.
    beginAiRun(KEY, 'sig-a');
    beginAiRun(KEY, 'sig-b');

    // The stale request finally resolves — it must not overwrite the newer run.
    completeAiRun(KEY, 'sig-a', { stale: true });

    expect(useDashboardStore.getState().aiCache[KEY]).toMatchObject({
      signature: 'sig-b',
      status: 'running',
    });
  });

  it('ignores a failure from a superseded run', () => {
    const { beginAiRun, completeAiRun, failAiRun } = useDashboardStore.getState();

    beginAiRun(KEY, 'sig-a');
    beginAiRun(KEY, 'sig-b');
    completeAiRun(KEY, 'sig-b', { fresh: true });

    failAiRun(KEY, 'sig-a', 'stale network error');

    const entry = useDashboardStore.getState().aiCache[KEY];
    expect(entry.status).toBe('done');
    expect(entry.data).toEqual({ fresh: true });
  });

  it('records an error against the signature that failed', () => {
    const { beginAiRun, failAiRun } = useDashboardStore.getState();

    beginAiRun(KEY, 'sig-a');
    failAiRun(KEY, 'sig-a', 'OPENAI_API_KEY not set');

    expect(useDashboardStore.getState().aiCache[KEY]).toMatchObject({
      signature: 'sig-a',
      status: 'error',
      error: 'OPENAI_API_KEY not set',
    });
  });

  it('keys separate analyses independently', () => {
    const { beginAiRun, completeAiRun } = useDashboardStore.getState();

    beginAiRun('overviewInsights', 'sig-a');
    beginAiRun('flawRecs', 'sig-b');
    completeAiRun('flawRecs', 'sig-b', { recommendations: [] });

    const cache = useDashboardStore.getState().aiCache;
    expect(cache.overviewInsights.status).toBe('running');
    expect(cache.flawRecs.status).toBe('done');
  });

  it('drops cached analyses when a new dataset is loaded', () => {
    const { beginAiRun, completeAiRun, loadMockData } = useDashboardStore.getState();

    beginAiRun(KEY, 'sig-a');
    completeAiRun(KEY, 'sig-a', { strengths: [] });
    expect(useDashboardStore.getState().aiCache[KEY]).toBeDefined();

    // A different dataset must never show the previous one's analysis.
    loadMockData();
    expect(useDashboardStore.getState().aiCache).toEqual({});
  });
});
