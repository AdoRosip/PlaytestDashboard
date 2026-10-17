import 'server-only';
import { clientKeys, portalDenied, privateHeaders, readSession, type PortalSession } from './portalAuth';
import { array, id, mapPortalData, object, text } from '../playlytix/mapper';
import { mapTranscripts } from '../playlytix/transcripts';
import { GAME_CONFIGS } from '../games';
import { portalDiagnostics } from './portalDiagnostics';
import { portalApiBase } from './portalConfig.mjs';

type Debug = ReturnType<typeof portalDiagnostics>;
const POSITIVE_ID = /^[1-9]\d*$/;

export async function portalApi(request: Request, testId?: string) {
  const debug = portalDiagnostics('api');
  debug.log('received');
  const response = await loadPortalData(request, testId, debug);
  debug.log('completed', { status: response.status });
  return debug.respond(response);
}

/** Parsed subtitle cues for one submission's videos, lazy-loaded by the dossier. */
export async function portalTranscripts(request: Request, testId: string, responseId: string) {
  const debug = portalDiagnostics('api');
  debug.log('received');
  const response = await loadTranscripts(request, testId, responseId, debug);
  debug.log('completed', { status: response.status });
  return debug.respond(response);
}

/** The session, or the response that rejects the request. */
function verifySession(request: Request, debug: Debug): PortalSession | Response {
  const session = readSession(request);
  if (!session) {
    debug.log('rejected', { reason: 'SESSION_MISSING_OR_INVALID' });
    return portalDenied();
  }
  if (request.headers.get('x-portal-session') !== session.sid) {
    debug.log('rejected', { reason: 'SESSION_HEADER_MISMATCH' });
    return portalDenied(409, 'Session changed. Reopen your test.');
  }
  debug.log('session_verified');
  return session;
}

/**
 * GET an upstream path with the session client's key; the body is size-bounded.
 * `stage` tracks progress so a failure is logged against the step that threw.
 */
async function fetchUpstream(path: string, session: PortalSession, debug: Debug, stage: { current: string }, notFound: string): Promise<unknown | Response> {
  const base = portalApiBase();
  const key = clientKeys()[session.clientId];
  stage.current = 'upstream_fetch';
  debug.log(stage.current);
  const response = await fetch(`${base}${path}`, {
    headers: { 'x-api-key': key, Accept: 'application/json' },
    cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20000),
  });
  debug.log('upstream_response', { status: response.status });
  if (!response.ok) return portalDenied(response.status === 404 ? 404 : response.status === 429 ? 429 : 502,
    response.status === 404 ? notFound : 'The Portal API is temporarily unavailable.');
  stage.current = 'read_upstream_body';
  // Bound the body even when Content-Length is absent or inaccurate.
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Empty API response');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 20 * 1024 * 1024) { await reader.cancel(); throw new Error('Oversized API response'); }
    chunks.push(value);
  }
  stage.current = 'parse_upstream_json';
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function loadPortalData(request: Request, testId: string | undefined, debug: Debug) {
  const session = verifySession(request, debug);
  if (session instanceof Response) return session;
  if (testId && !POSITIVE_ID.test(testId)) return portalDenied(400, 'Invalid test.');
  const stage = { current: 'api_configuration' };
  try {
    const data = await fetchUpstream(`/tests${testId ? `/${testId}/responses` : ''}`, session, debug, stage, 'Test not found for this client.');
    if (data instanceof Response) return data;
    if (!testId) {
      stage.current = 'map_test_list';
      const tests = array(object(data).tests).map(object).map(t => ({ id: id(t.TestID), name: text(t.TestName) }));
      return Response.json({ tests }, { headers: privateHeaders });
    }
    stage.current = 'game_configuration';
    const map = object(JSON.parse(process.env.PLAYLYTIX_TEST_GAME_MAP || '{}'));
    const configId = map[`${session.clientId}:${testId}`] ?? 'portal-generic';
    if (typeof configId !== 'string' || !Object.hasOwn(GAME_CONFIGS, configId)) throw new Error('Invalid game configuration');
    stage.current = 'map_test_responses';
    return Response.json(mapPortalData(data, session.clientId, testId, GAME_CONFIGS[configId]), { headers: privateHeaders });
  } catch (error) {
    debug.failure(stage.current, error);
    return portalDenied(502, 'Unable to load this test. Check the API configuration or try again later.');
  }
}

async function loadTranscripts(request: Request, testId: string, responseId: string, debug: Debug) {
  const session = verifySession(request, debug);
  if (session instanceof Response) return session;
  if (!POSITIVE_ID.test(testId) || !POSITIVE_ID.test(responseId)) return portalDenied(400, 'Invalid transcript request.');
  const stage = { current: 'api_configuration' };
  try {
    const data = await fetchUpstream(`/tests/${testId}/responses/${responseId}/transcripts`, session, debug, stage, 'Transcript not found for this submission.');
    if (data instanceof Response) return data;
    stage.current = 'map_transcripts';
    return Response.json(mapTranscripts(data, Number(responseId)), { headers: privateHeaders });
  } catch (error) {
    debug.failure(stage.current, error);
    return portalDenied(502, 'Unable to load this transcript. Try again later.');
  }
}
