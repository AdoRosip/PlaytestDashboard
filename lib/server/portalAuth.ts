import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { PortalAuthError, portalDiagnostics } from './portalDiagnostics';
import { configuredClientKeys } from './portalConfig.mjs';

// A missing switch must never expose the demo workflow on Vercel Production.
export const portalMode = () => process.env.VERCEL_ENV === 'production' || process.env.PORTAL_MODE === 'true';
export const privateHeaders = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' };
export const cookieName = () => process.env.NODE_ENV === 'production' ? '__Host-playlytix-session' : 'playlytix-session';
export const cookieOptions = () => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge: 7200 });
export interface PortalSession { clientId: string; issuedAt: number; expiresAt: number; sid: string }

export function clientKeys(): Record<string, string> {
  try { return configuredClientKeys(); }
  catch (error) { throw new PortalAuthError((error as Error).message); }
}
function secret(name: string) {
  const value = process.env[name];
  if (!value || value.length < 32) throw new PortalAuthError(`${name}_MISSING_OR_TOO_SHORT`);
  if (name === 'DASHBOARD_SESSION_SECRET' && value === process.env.DASHBOARD_SSO_SECRET) throw new PortalAuthError('SESSION_SECRET_MUST_BE_SEPARATE');
  return value;
}
function sign(payload: string, key: string) { return createHmac('sha256', key).update(payload).digest('base64url'); }
function decode(token: string, key: string): Record<string, unknown> {
  if (token.length > 2048) throw new PortalAuthError('TOKEN_MALFORMED');
  const parts = token.split('.');
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[1])) throw new PortalAuthError('TOKEN_MALFORMED');
  if (!timingSafeEqual(Buffer.from(parts[1]), Buffer.from(sign(parts[0], key)))) throw new PortalAuthError('TOKEN_SIGNATURE_MISMATCH');
  let claims;
  try { claims = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')); }
  catch { throw new PortalAuthError('TOKEN_PAYLOAD_INVALID_JSON'); }
  if (!claims || typeof claims !== 'object' || Array.isArray(claims)) throw new PortalAuthError('TOKEN_CLAIMS_INVALID');
  return claims;
}
export function verifyLaunch(token: string, now = Math.floor(Date.now() / 1000)): string {
  const { d, e } = decode(token, secret('DASHBOARD_SSO_SECRET'));
  if (!Number.isSafeInteger(d) || (d as number) <= 0 || !Number.isSafeInteger(e)) throw new PortalAuthError('LAUNCH_CLAIMS_INVALID');
  const timing = { serverTime: now, expiresAt: e as number, remainingSeconds: (e as number) - now };
  if ((e as number) <= now) throw new PortalAuthError('LAUNCH_EXPIRED', timing);
  if ((e as number) > now + 330) throw new PortalAuthError('LAUNCH_EXPIRY_TOO_FAR', timing);
  const id = String(d);
  if (!Object.hasOwn(clientKeys(), id)) throw new PortalAuthError('CLIENT_NOT_CONFIGURED');
  return id;
}
export function issueSession(clientId: string, now = Math.floor(Date.now() / 1000)) {
  if (!Object.hasOwn(clientKeys(), clientId)) throw new PortalAuthError('CLIENT_NOT_CONFIGURED');
  const session: PortalSession = { clientId, issuedAt: now, expiresAt: now + 7200, sid: randomBytes(16).toString('hex') };
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url');
  return { session, token: `${payload}.${sign(payload, secret('DASHBOARD_SESSION_SECRET'))}` };
}
export function readSession(request: Request, now = Math.floor(Date.now() / 1000)): PortalSession | null {
  if (!portalMode()) return null;
  try {
    const token = request.headers.get('cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith(cookieName() + '='))?.slice(cookieName().length + 1);
    if (!token) {
      portalDiagnostics('session').log('rejected', { reason: 'SESSION_COOKIE_MISSING' });
      return null;
    }
    const s = decode(token, secret('DASHBOARD_SESSION_SECRET'));
    if (typeof s.clientId !== 'string' || !Object.hasOwn(clientKeys(), s.clientId) ||
      !Number.isSafeInteger(s.issuedAt) || !Number.isSafeInteger(s.expiresAt) ||
      (s.issuedAt as number) > now || (s.expiresAt as number) <= now ||
      (s.expiresAt as number) - (s.issuedAt as number) !== 7200 || typeof s.sid !== 'string' || !/^[a-f0-9]{32}$/.test(s.sid)) throw new PortalAuthError('SESSION_INVALID_OR_EXPIRED');
    return s as unknown as PortalSession;
  } catch (error) { portalDiagnostics('session').failure('rejected', error); return null; }
}
export function portalDenied(status = 401, message = 'Open this dashboard from the Playlytix Portal.') {
  return Response.json({ error: message }, { status, headers: privateHeaders });
}
