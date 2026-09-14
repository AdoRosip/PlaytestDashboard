import 'server-only';
import { clientKeys, portalDenied, privateHeaders, readSession } from './portalAuth';
import { array, id, mapPortalData, object, text } from '../playlytix/mapper';
import { GAME_CONFIGS } from '../games';

export async function portalApi(request: Request, testId?: string) {
  const session = readSession(request);
  if (!session) return portalDenied();
  if (request.headers.get('x-portal-session') !== session.sid) return portalDenied(409, 'Session changed. Reopen your test.');
  if (testId && !/^[1-9]\d*$/.test(testId)) return portalDenied(400, 'Invalid test.');
  try {
    const base = new URL(process.env.PLAYLYTIX_API_BASE_URL || '');
    if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) throw new Error('Invalid API configuration');
    const response = await fetch(`${base.href.replace(/\/$/, '')}/tests${testId ? `/${testId}/responses` : ''}`, {
      headers: { 'x-api-key': clientKeys()[session.clientId], Accept: 'application/json' },
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) return portalDenied(response.status === 404 ? 404 : response.status === 429 ? 429 : 502,
      response.status === 404 ? 'Test not found for this client.' : 'The Portal API is temporarily unavailable.');
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
    const data: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!testId) {
      const tests = array(object(data).tests).map(object).map(t => ({ id: id(t.TestID), name: text(t.TestName) }));
      return Response.json({ tests }, { headers: privateHeaders });
    }
    const map = object(JSON.parse(process.env.PLAYLYTIX_TEST_GAME_MAP || '{}'));
    const configId = map[`${session.clientId}:${testId}`] ?? 'portal-generic';
    if (typeof configId !== 'string' || !Object.hasOwn(GAME_CONFIGS, configId)) throw new Error('Invalid game configuration');
    return Response.json(mapPortalData(data, session.clientId, testId, GAME_CONFIGS[configId]), { headers: privateHeaders });
  } catch { return portalDenied(502, 'Unable to load this test. Check the API configuration or try again later.'); }
}
