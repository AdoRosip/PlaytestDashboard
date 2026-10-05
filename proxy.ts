import { NextResponse, type NextRequest } from 'next/server';
import { requireDashboardAuth } from '@/lib/server/requestAuth';
import { portalMode, portalDenied, privateHeaders } from '@/lib/server/portalAuth';
import { portalDiagnostics } from '@/lib/server/portalDiagnostics';

export function proxy(request: NextRequest) {
  if (portalMode()) {
    const path = request.nextUrl.pathname;
    if (path === '/auth/launch' || path === '/portal-entry') return NextResponse.next();
    const launch = path.match(/^\/tests\/([1-9]\d*)$/);
    if (launch && request.nextUrl.searchParams.has('token')) {
      portalDiagnostics('proxy').log('rewrite_launch');
      const url = request.nextUrl.clone();
      url.pathname = '/auth/launch';
      url.searchParams.set('testId', launch[1]);
      return NextResponse.rewrite(url, { headers: privateHeaders });
    }
    const denied = requireDashboardAuth(request);
    if (denied) {
      const debug = portalDiagnostics('proxy');
      debug.log('access_denied', { status: denied.status });
      return debug.respond(path.startsWith('/api/') ? denied : NextResponse.redirect(new URL('/portal-entry', request.url)));
    }
    if (/^\/(upload|registry|settings|builder|themes)(\/|$)/.test(path)) return portalDenied(403, 'This feature is unavailable in Portal mode.');
    const scoped = path.match(/^\/tests\/([1-9]\d*)\/(overview|categories|questions|testers|responses|export)(\/.*)?$/);
    if (scoped) {
      const url = request.nextUrl.clone();
      url.pathname = `/${scoped[2]}${scoped[3] || ''}`;
      return NextResponse.rewrite(url, { headers: privateHeaders });
    }
    const response = NextResponse.next();
    for (const [key, value] of Object.entries(privateHeaders)) response.headers.set(key, value);
    return response;
  }
  return requireDashboardAuth(request) ?? undefined;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
