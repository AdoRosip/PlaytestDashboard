import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const portalMode = () => process.env.PORTAL_MODE === 'true';
export const privateHeaders = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' };
export const cookieName = () => process.env.NODE_ENV === 'production' ? '__Host-playlytix-session' : 'playlytix-session';
export const cookieOptions = () => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge: 7200 });
export interface PortalSession { clientId: string; issuedAt: number; expiresAt: number; sid: string }

export function clientKeys(): Record<string, string> {
  const keys: unknown = JSON.parse(process.env.PLAYLYTIX_CLIENT_KEYS || '{}');
  if (!keys || typeof keys !== 'object' || Array.isArray(keys) || !Object.keys(keys).length ||
    !Object.entries(keys).every(([id, key]) => /^[1-9]\d*$/.test(id) && typeof key === 'string' && key.length >= 32)) throw new Error('Invalid client configuration');
  return keys as Record<string, string>;
}
function secret(name: string) {
  const value = process.env[name];
  if (!value || value.length < 32) throw new Error('Missing signing configuration');
  if (name === 'DASHBOARD_SESSION_SECRET' && value === process.env.DASHBOARD_SSO_SECRET) throw new Error('Session secret must be separate');
  return value;
}
function sign(payload: string, key: string) { return createHmac('sha256', key).update(payload).digest('base64url'); }
function decode(token: string, key: string): Record<string, unknown> {
  if (token.length > 2048) throw new Error('Invalid token');
  const parts = token.split('.');
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[1])) throw new Error('Invalid token');
  if (!timingSafeEqual(Buffer.from(parts[1]), Buffer.from(sign(parts[0], key)))) throw new Error('Invalid token');
  const claims = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  if (!claims || typeof claims !== 'object' || Array.isArray(claims)) throw new Error('Invalid claims');
  return claims;
}
export function verifyLaunch(token: string, now = Math.floor(Date.now() / 1000)): string {
  const { d, e } = decode(token, secret('DASHBOARD_SSO_SECRET'));
  if (!Number.isSafeInteger(d) || (d as number) <= 0 || !Number.isSafeInteger(e) || (e as number) <= now || (e as number) > now + 330) throw new Error('Invalid launch');
  const id = String(d);
  if (!Object.hasOwn(clientKeys(), id)) throw new Error('Unknown client');
  return id;
}
export function issueSession(clientId: string, now = Math.floor(Date.now() / 1000)) {
  if (!Object.hasOwn(clientKeys(), clientId)) throw new Error('Unknown client');
  const session: PortalSession = { clientId, issuedAt: now, expiresAt: now + 7200, sid: randomBytes(16).toString('hex') };
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url');
  return { session, token: `${payload}.${sign(payload, secret('DASHBOARD_SESSION_SECRET'))}` };
}
export function readSession(request: Request, now = Math.floor(Date.now() / 1000)): PortalSession | null {
  if (!portalMode()) return null;
  try {
    const token = request.headers.get('cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith(cookieName() + '='))?.slice(cookieName().length + 1);
    if (!token) return null;
    const s = decode(token, secret('DASHBOARD_SESSION_SECRET'));
    if (typeof s.clientId !== 'string' || !Object.hasOwn(clientKeys(), s.clientId) ||
      !Number.isSafeInteger(s.issuedAt) || !Number.isSafeInteger(s.expiresAt) ||
      (s.issuedAt as number) > now || (s.expiresAt as number) <= now ||
      (s.expiresAt as number) - (s.issuedAt as number) !== 7200 || typeof s.sid !== 'string' || !/^[a-f0-9]{32}$/.test(s.sid)) return null;
    return s as unknown as PortalSession;
  } catch { return null; }
}
export function portalDenied(status = 401, message = 'Open this dashboard from the Playlytix Portal.') {
  return Response.json({ error: message }, { status, headers: privateHeaders });
}
