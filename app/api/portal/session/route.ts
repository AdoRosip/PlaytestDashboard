import { NextResponse } from 'next/server';
import { portalDiagnostics } from '@/lib/server/portalDiagnostics';
import { cookieName, cookieOptions, portalDenied, privateHeaders, readSession, renewSession } from '@/lib/server/portalAuth';
export function GET(request: Request) {
  const debug = portalDiagnostics('session');
  const session = readSession(request);
  debug.log(session ? 'verified' : 'rejected');
  return debug.respond(session ? Response.json(session, { headers: privateHeaders }) : portalDenied());
}
/**
 * Renews the session while the dashboard is in use. A tab holding a replaced
 * session gets the current one back unrenewed, so it sees the new sid and closes.
 */
export function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return portalDenied(403);
  const debug = portalDiagnostics('session');
  const current = readSession(request);
  if (!current) { debug.log('rejected'); return debug.respond(portalDenied()); }
  if (request.headers.get('x-portal-session') !== current.sid) return debug.respond(Response.json(current, { headers: privateHeaders }));
  const now = Math.floor(Date.now() / 1000);
  const { session, token } = renewSession(current, now);
  debug.log('renewed', { expiresAt: session.expiresAt });
  const response = NextResponse.json(session, { headers: privateHeaders });
  response.cookies.set(cookieName(), token, cookieOptions(session.expiresAt - now));
  return debug.respond(response);
}
export function DELETE(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return portalDenied(403);
  const response = NextResponse.json({ ok: true }, { headers: privateHeaders });
  response.cookies.set(cookieName(), '', { ...cookieOptions(), maxAge: 0 });
  return response;
}
