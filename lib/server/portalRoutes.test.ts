import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
vi.mock('server-only', () => ({}));
import { portalApi } from './portalApi';
import { issueSession, cookieName } from './portalAuth';
import { GET as launch } from '../../app/auth/launch/route';
import { DELETE as logout } from '../../app/api/portal/session/route';
beforeEach(() => {
  vi.stubEnv('PORTAL_MODE', 'true');
  vi.stubEnv('DASHBOARD_SSO_SECRET', 'launch-test-secret-with-32-characters');
  vi.stubEnv('DASHBOARD_SESSION_SECRET', 'session-test-secret-with-32-characters');
  vi.stubEnv('PLAYLYTIX_CLIENT_KEYS', JSON.stringify({ '2': 'a'.repeat(64), '18': 'b'.repeat(64) }));
  vi.stubEnv('PLAYLYTIX_API_BASE_URL', 'https://upstream.example/api');
  vi.stubEnv('PLAYLYTIX_TEST_GAME_MAP', '{}');
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
function request(clientId: string, path = '/api/portal/tests') {
  const { token, session } = issueSession(clientId);
  return new Request(`https://dashboard.example${path}`, { headers: { cookie: `${cookieName()}=${token}`, 'x-portal-session': session.sid } });
}
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
