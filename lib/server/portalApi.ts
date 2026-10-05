import 'server-only';
import { clientKeys, portalDenied, privateHeaders, readSession } from './portalAuth';
import { array, id, mapPortalData, object, text } from '../playlytix/mapper';
import { GAME_CONFIGS } from '../games';
import { portalDiagnostics } from './portalDiagnostics';
import { portalApiBase } from './portalConfig.mjs';

export async function portalApi(request: Request, testId?: string) {
  const debug = portalDiagnostics('api');
  debug.log('received');
  const response = await loadPortalData(request, testId, debug);
  debug.log('completed', { status: response.status });
  return debug.respond(response);
}

async function loadPortalData(request: Request, testId: string | undefined, debug: ReturnType<typeof portalDiagnostics>) {
  const session = readSession(request);
  if (!session) {
    debug.log('rejected', { reason: 'SESSION_MISSING_OR_INVALID' });
    return portalDenied();
  }
  if (request.headers.get('x-portal-session') !== session.sid) {
    debug.log('rejected', { reason: 'SESSION_HEADER_MISMATCH' });
    return portalDenied(409, 'Session changed. Reopen your test.');
  }
  if (testId && !/^[1-9]\d*$/.test(testId)) return portalDenied(400, 'Invalid test.');
  debug.log('session_verified');
  let stage = 'api_configuration';
  try {
    const base = portalApiBase();
    const key = clientKeys()[session.clientId];
    stage = 'upstream_fetch';
    debug.log(stage);
    const response = await fetch(`${base}/tests${testId ? `/${testId}/responses` : ''}`, {
      headers: { 'x-api-key': key, Accept: 'application/json' },
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20000),
    });
    debug.log('upstream_response', { status: response.status });
    if (!response.ok) return portalDenied(response.status === 404 ? 404 : response.status === 429 ? 429 : 502,
      response.status === 404 ? 'Test not found for this client.' : 'The Portal API is temporarily unavailable.');
    stage = 'read_upstream_body';
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
    stage = 'parse_upstream_json';
    const data: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!testId) {
      stage = 'map_test_list';
      const tests = array(object(data).tests).map(object).map(t => ({ id: id(t.TestID), name: text(t.TestName) }));
      return Response.json({ tests }, { headers: privateHeaders });
    }
    stage = 'game_configuration';
    const map = object(JSON.parse(process.env.PLAYLYTIX_TEST_GAME_MAP || '{}'));
    const configId = map[`${session.clientId}:${testId}`] ?? 'portal-generic';
    if (typeof configId !== 'string' || !Object.hasOwn(GAME_CONFIGS, configId)) throw new Error('Invalid game configuration');
    stage = 'map_test_responses';
    return Response.json(mapPortalData(data, session.clientId, testId, GAME_CONFIGS[configId]), { headers: privateHeaders });
  } catch (error) {
    debug.failure(stage, error);
    return portalDenied(502, 'Unable to load this test. Check the API configuration or try again later.');
  }
}
