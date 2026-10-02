import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
vi.mock('server-only', () => ({}));
import { portalApi } from './portalApi';
import { issueSession, cookieName } from './portalAuth';
import { GET as launch } from '../../app/auth/launch/route';
import { DELETE as logout } from '../../app/api/portal/session/route';
import productionResponse from '../../tests/fixtures/portal-production-response.json';
beforeEach(() => {
  vi.stubEnv('PORTAL_MODE', 'true');
  vi.stubEnv('DASHBOARD_SSO_SECRET', 'launch-test-secret-with-32-characters');
  vi.stubEnv('DASHBOARD_SESSION_SECRET', 'session-test-secret-with-32-characters');
  vi.stubEnv('PLAYLYTIX_CLIENT_KEYS', JSON.stringify({ '2': 'a'.repeat(64), '18': 'b'.repeat(64) }));
  vi.stubEnv('PLAYLYTIX_API_BASE_URL', 'https://upstream.example/api');
  vi.stubEnv('PLAYLYTIX_TEST_GAME_MAP', '{}');
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function request(clientId: string, path = '/api/portal/tests') {
  const { token, session } = issueSession(clientId);
  return new Request(`https://dashboard.example${path}`, { headers: { cookie: `${cookieName()}=${token}`, 'x-portal-session': session.sid } });
}
it('fetches and normalizes the production sample using only the configured client key', async () => {
  vi.stubEnv('VERCEL_ENV', 'production');
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('PLAYLYTIX_CLIENT_KEYS', JSON.stringify({
    '7': 'production-fixture-key-'.repeat(3), '9': 'other-client-fixture-key-'.repeat(3),
  }));
  vi.stubEnv('PLAYLYTIX_API_BASE_URL', 'https://app.playlytix.gg/api');
  const fetchMock = vi.fn(async () => Response.json(productionResponse));
  vi.stubGlobal('fetch', fetchMock);
  const response = await portalApi(request('7'), '18');
  expect(response.status).toBe(200);
  expect(fetchMock).toHaveBeenCalledWith('https://app.playlytix.gg/api/tests/18/responses', expect.objectContaining({
    headers: { 'x-api-key': 'production-fixture-key-'.repeat(3), Accept: 'application/json' }, cache: 'no-store',
  }));
  const data = await response.json();
  expect(data.responses[0].normalizedScore).toBe(50);
  expect(data.testers[0].username).toBe('hilmersen'); // explicitly non-anonymous
  expect(JSON.stringify(data)).not.toMatch(/evaluationScore|payoutStatus|syncedAt/);
  const otherResponse = await portalApi(request('9'), '18');
  expect(otherResponse.status).toBe(200);
  expect((await otherResponse.json()).project.id).toBe('portal_9_18');
  expect(fetchMock).toHaveBeenLastCalledWith('https://app.playlytix.gg/api/tests/18/responses', expect.objectContaining({
    headers: { 'x-api-key': 'other-client-fixture-key-'.repeat(3), Accept: 'application/json' },
  }));
  vi.stubEnv('PLAYLYTIX_API_BASE_URL', 'https://qa.playlytix.gg/api');
  fetchMock.mockClear();
  expect((await portalApi(request('7'), '18')).status).toBe(502);
  expect(fetchMock).not.toHaveBeenCalled();
});
it('selects each session client key and strips private test-list fields', async () => {
  const fetchMock = vi.fn().mockImplementation(async () => Response.json({ tests: [{ TestID: 32, TestName: 'Test', DeveloperEmail: 'private' }] }));
  vi.stubGlobal('fetch', fetchMock);
  for (const [clientId, key] of [['2', 'a'], ['18', 'b']]) {
    const result = await portalApi(request(clientId));
    expect(await result.json()).toEqual({ tests: [{ id: 32, name: 'Test' }] });
    expect(result.headers.get('cache-control')).toBe('private, no-store');
    expect(fetchMock.mock.lastCall?.[1]).toMatchObject({ headers: { 'x-api-key': key.repeat(64) }, cache: 'no-store', redirect: 'error' });
  }
});
it('denies anonymous and stale-tab requests before calling upstream', async () => {
  const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
  expect((await portalApi(new Request('https://dashboard.example/api/portal/tests'))).status).toBe(401);
  const req = request('2'); req.headers.set('x-portal-session', 'old-tab');
  expect((await portalApi(req)).status).toBe(409);
  expect(fetchMock).not.toHaveBeenCalled();
});
it.each([[404, 404], [401, 502], [429, 429], [500, 502]])('translates upstream %i without exposing its body', async (upstream, expected) => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('private backend details', { status: upstream })));
  const result = await portalApi(request('2'), '32');
  expect(result.status).toBe(expected);
  expect(await result.text()).not.toContain('private backend details');
});
it('handles malformed JSON and network failure safely', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('not-json')));
  expect((await portalApi(request('2'))).status).toBe(502);
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network'); }));
  expect((await portalApi(request('2'))).status).toBe(502);
});
it('launches with a clean redirect and rejects invalid links', () => {
  const payload = Buffer.from(JSON.stringify({ d: 18, e: Math.floor(Date.now() / 1000) + 300 })).toString('base64url');
  const token = `${payload}.${createHmac('sha256', process.env.DASHBOARD_SSO_SECRET!).update(payload).digest('base64url')}`;
  const result = launch(new Request(`https://dashboard.example/auth/launch?testId=32&token=${token}`));
  expect(result.status).toBe(303);
  expect(result.headers.get('location')).toBe('https://dashboard.example/tests/32/overview');
  expect(result.headers.get('set-cookie')).toContain('HttpOnly');
  expect(result.headers.get('referrer-policy')).toBe('no-referrer');
  expect(launch(new Request('https://dashboard.example/auth/launch?token=bad')).status).toBe(401);
});
it('rejects cross-origin logout and clears the cookie for same-origin logout', () => {
  expect(logout(new Request('https://dashboard.example/api/portal/session', { method: 'DELETE', headers: { origin: 'https://evil.example' } })).status).toBe(403);
  const result = logout(new Request('https://dashboard.example/api/portal/session', { method: 'DELETE', headers: { origin: 'https://dashboard.example' } }));
  expect(result.headers.get('set-cookie')).toContain('Max-Age=0');
});

function launchRequest(expiry = Math.floor(Date.now() / 1000) + 300) {
  const payload = Buffer.from(JSON.stringify({ d: 2, e: expiry })).toString('base64url');
  const token = `${payload}.${createHmac('sha256', process.env.DASHBOARD_SSO_SECRET!).update(payload).digest('base64url')}`;
  return new Request(`https://dashboard.example/tests/21?token=${token}`);
}

it.each([
  ['DASHBOARD_SSO_SECRET', 'different-launch-secret-with-32-characters', 'verify_launch', 'TOKEN_SIGNATURE_MISMATCH'],
  ['DASHBOARD_SSO_SECRET', '', 'verify_launch', 'DASHBOARD_SSO_SECRET_MISSING_OR_TOO_SHORT'],
  ['PLAYLYTIX_CLIENT_KEYS', '{broken', 'verify_launch', 'CLIENT_KEYS_INVALID_JSON'],
  ['PLAYLYTIX_CLIENT_KEYS', '{}', 'verify_launch', 'CLIENT_KEYS_INVALID_CONFIGURATION'],
  ['PLAYLYTIX_CLIENT_KEYS', JSON.stringify({ '18': 'b'.repeat(64) }), 'verify_launch', 'CLIENT_NOT_CONFIGURED'],
  ['DASHBOARD_SESSION_SECRET', '', 'issue_session', 'DASHBOARD_SESSION_SECRET_MISSING_OR_TOO_SHORT'],
  ['DASHBOARD_SESSION_SECRET', 'launch-test-secret-with-32-characters', 'issue_session', 'SESSION_SECRET_MUST_BE_SEPARATE'],
])('diagnoses %s failures privately: %s', async (name, value, stage, reason) => {
  vi.stubEnv('PORTAL_DEBUG', 'true');
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  const req = launchRequest();
  vi.stubEnv(name, value);
  const response = launch(req);
  expect(response.status).toBe(401);
  const entries = log.mock.calls.map(call => JSON.parse(call[1]));
  expect(entries).toContainEqual(expect.objectContaining({ stage, reason, requestId: response.headers.get('x-portal-debug-id') }));
  const output = JSON.stringify(log.mock.calls);
  expect(output).not.toContain(new URL(req.url).searchParams.get('token'));
  expect(output).not.toContain('launch-test-secret-with-32-characters');
  expect(output).not.toContain('a'.repeat(64));
  expect(await response.text()).not.toContain(reason);
});

it.each([-1, 331])('reports verified expiry timing (%i seconds)', offset => {
  vi.stubEnv('PORTAL_DEBUG', 'true');
  vi.useFakeTimers();
  try {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
    const now = Math.floor(Date.now() / 1000);
    expect(launch(launchRequest(now + offset)).status).toBe(401);
    expect(log.mock.calls.map(call => JSON.parse(call[1]))).toContainEqual(expect.objectContaining({
      reason: offset < 0 ? 'LAUNCH_EXPIRED' : 'LAUNCH_EXPIRY_TOO_FAR', remainingSeconds: offset, serverTime: now,
    }));
  } finally { vi.useRealTimers(); }
});

it('logs successful launch stages and preserves rewritten test context', () => {
  vi.stubEnv('PORTAL_DEBUG', 'true');
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  const response = launch(launchRequest());
  expect(response.headers.get('location')).toBe('https://dashboard.example/tests/21/overview');
  expect(log.mock.calls.map(call => JSON.parse(call[1]).stage)).toEqual(['received', 'launch_verified', 'session_issued', 'redirect_ready']);
  expect(JSON.stringify(log.mock.calls)).not.toContain(response.headers.get('set-cookie'));
});

it('keeps diagnostics off unless explicitly enabled', () => {
  vi.stubEnv('PORTAL_DEBUG', 'false');
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  const response = launch(launchRequest(1));
  expect(response.status).toBe(401);
  expect(response.headers.has('x-portal-debug-id')).toBe(false);
  expect(log).not.toHaveBeenCalled();
});

it('logs upstream status and parsing stage without leaking upstream content', async () => {
  vi.stubEnv('PORTAL_DEBUG', 'true');
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.stubGlobal('fetch', vi.fn(async () => new Response('private backend details')));
  const response = await portalApi(request('2'));
  const entries = log.mock.calls.map(call => JSON.parse(call[1]));
  expect(entries).toContainEqual(expect.objectContaining({ stage: 'upstream_response', status: 200 }));
  expect(entries).toContainEqual(expect.objectContaining({ stage: 'parse_upstream_json', reason: 'UNEXPECTED_ERROR' }));
  expect(entries.every(entry => entry.requestId === response.headers.get('x-portal-debug-id'))).toBe(true);
  expect(JSON.stringify(log.mock.calls)).not.toContain('private backend details');
  expect(JSON.stringify(log.mock.calls)).not.toContain('a'.repeat(64));
});
