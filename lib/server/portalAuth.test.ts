import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { cookieName, cookieOptions, issueSession, readSession, verifyLaunch } from './portalAuth';
import { requireDashboardAuth } from './requestAuth';
const now = 1800000000;
const launchSecret = 'launch-fixture-secret-not-for-use-12345';
function launch(claims: unknown) {
  const p = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${p}.${createHmac('sha256', launchSecret).update(p).digest('base64url')}`;
}
beforeEach(() => {
  vi.stubEnv('PORTAL_MODE', 'true');
  vi.stubEnv('DASHBOARD_SSO_SECRET', launchSecret);
  vi.stubEnv('DASHBOARD_SESSION_SECRET', 'independent-session-fixture-secret-12345');
  vi.stubEnv('PLAYLYTIX_CLIENT_KEYS', JSON.stringify({ '2': 'a'.repeat(64), '18': 'b'.repeat(64) }));
});
afterEach(() => vi.unstubAllEnvs());
describe('Portal launch and session security', () => {
  it('accepts the documented encoded-payload HMAC contract', () => {
    expect(verifyLaunch(launch({ d: 18, e: now + 300 }), now)).toBe('18');
  });
  it.each([
    { d: 2, e: now }, { d: 2, e: now + 331 }, { d: '2', e: now + 30 },
    { d: 3, e: now + 30 }, { d: 2, e: '1800000030' }, null,
  ])('rejects invalid launch claims %j', claims => {
    expect(() => verifyLaunch(launch(claims), now)).toThrow();
  });
  it.each(['', '.', 'abc.a', 'a.'.repeat(2000), 'a.b.c'])('rejects malformed tokens without timing comparison errors', token => {
    expect(() => verifyLaunch(token, now)).toThrow();
  });
  it('rejects changes to signed bytes', () => {
    const token = launch({ d: 2, e: now + 30 });
    expect(() => verifyLaunch('x' + token.slice(1), now)).toThrow();
  });
  it('keeps sessions valid after launch expires, then enforces two-hour expiry', () => {
    const { token } = issueSession('2', now);
    const request = new Request('https://dashboard.test/api/portal/tests', { headers: { cookie: `${cookieName()}=${token}` } });
    expect(readSession(request, now + 400)?.clientId).toBe('2');
    expect(readSession(request, now + 7200)).toBeNull();
    expect(readSession(new Request(request, { headers: { cookie: `${cookieName()}=${token}x` } }), now)).toBeNull();
    vi.stubEnv('PLAYLYTIX_CLIENT_KEYS', '{}');
    expect(readSession(request, now)).toBeNull();
  });
  it('fails closed without configuration or a session', () => {
    vi.stubEnv('DASHBOARD_AUTH_ENABLED', 'false');
    expect(requireDashboardAuth(new Request('https://dashboard.test/api/portal/tests'))?.status).toBe(401);
    vi.stubEnv('DASHBOARD_SSO_SECRET', '');
    expect(() => verifyLaunch(launch({ d: 2, e: now + 30 }), now)).toThrow();
  });
  it('disables registry and AI even for an authenticated client', () => {
    const { token } = issueSession('2');
    for (const path of ['/api/testers/match', '/api/testers/import', '/api/themes', '/api/question-analysis', '/api/overview-insights', '/api/flaw-recommendations']) {
      expect(requireDashboardAuth(new Request(`https://dashboard.test${path}`, { headers: { cookie: `${cookieName()}=${token}` } }))?.status).toBe(403);
    }
  });
  it('uses production host-only secure HttpOnly cookies and independent secrets', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(cookieName()).toBe('__Host-playlytix-session');
    expect(cookieOptions()).toEqual({ httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 7200 });
    vi.stubEnv('DASHBOARD_SESSION_SECRET', launchSecret);
    expect(() => issueSession('2')).toThrow();
  });
});
