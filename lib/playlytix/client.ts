import 'server-only';
import type { PlaylytixTestListItem, PlaylytixTestResponsesPayload } from './types';

const DEFAULT_BASE_URL = 'https://qa.playlytix.gg/api';

/** Thrown for any non-2xx response; `status` lets callers map it to a client-facing error. */
export class PlaylytixApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'PlaylytixApiError';
    this.status = status;
  }
}

function baseUrl(): string {
  return process.env.PLAYLYTIX_API_BASE_URL || DEFAULT_BASE_URL;
}

async function playlytixGet<T>(path: string): Promise<T> {
  const apiKey = process.env.PLAYLYTIX_API_KEY;
  if (!apiKey) {
    throw new PlaylytixApiError(503, 'PLAYLYTIX_API_KEY is not configured on this deployment.');
  }

  let res: Response;
  try {
    res = await fetch(`${baseUrl()}${path}`, {
      headers: { 'x-api-key': apiKey },
      cache: 'no-store',
    });
  } catch (err) {
    throw new PlaylytixApiError(502, err instanceof Error ? err.message : 'Failed to reach the Playlytix API.');
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new PlaylytixApiError(res.status, body.error ?? `Playlytix API returned HTTP ${res.status}.`);
  }

  return res.json() as Promise<T>;
}

/** `GET /tests` — lightweight list, newest first. Mainly useful for discovery/debugging. */
export function fetchPlaylytixTestList(): Promise<{ tests: PlaylytixTestListItem[] }> {
  return playlytixGet('/tests');
}

/** `GET /tests/:id/responses` — the full payload a dashboard needs to render one test. */
export function fetchPlaylytixTestResponses(testId: string | number): Promise<PlaylytixTestResponsesPayload> {
  return playlytixGet(`/tests/${testId}/responses`);
}
