import { NextResponse } from 'next/server';
import { portalDiagnostics } from '@/lib/server/portalDiagnostics';
import { cookieName, cookieOptions, portalDenied, privateHeaders, readSession } from '@/lib/server/portalAuth';
export function GET(request: Request) {
  const debug = portalDiagnostics('session');
  const session = readSession(request);
  debug.log(session ? 'verified' : 'rejected');
  return debug.respond(session ? Response.json(session, { headers: privateHeaders }) : portalDenied());
}
export function DELETE(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return portalDenied(403);
  const response = NextResponse.json({ ok: true }, { headers: privateHeaders });
  response.cookies.set(cookieName(), '', { ...cookieOptions(), maxAge: 0 });
  return response;
}
