import { NextResponse } from 'next/server';
import { portalDiagnostics } from '@/lib/server/portalDiagnostics';
import { cookieName, cookieOptions, issueSession, portalDenied, portalMode, privateHeaders, verifyLaunch } from '@/lib/server/portalAuth';

export function GET(request: Request) {
  const debug = portalDiagnostics('launch');
  debug.log('received');
  if (!portalMode()) {
    debug.log('rejected', { reason: 'PORTAL_MODE_DISABLED' });
    return debug.respond(portalDenied(404));
  }
  const url = new URL(request.url);
  // A Proxy rewrite retains the original incoming URL in some Next runtimes.
  const testId = url.searchParams.get('testId') ?? url.pathname.match(/^\/tests\/([1-9]\d*)$/)?.[1] ?? null;
  if (testId !== null && !/^[1-9]\d*$/.test(testId)) {
    debug.log('rejected', { reason: 'TEST_ID_INVALID' });
    return debug.respond(portalDenied(400, 'Invalid test.'));
  }
  let stage = 'verify_launch';
  try {
    if (url.searchParams.getAll('token').length !== 1) {
      debug.log('rejected', { reason: 'TOKEN_MISSING_OR_DUPLICATED' });
      return debug.respond(portalDenied());
    }
    const clientId = verifyLaunch(url.searchParams.get('token') || '');
    debug.log('launch_verified');
    stage = 'issue_session';
    const { token } = issueSession(clientId);
    debug.log('session_issued');
    stage = 'set_cookie_and_redirect';
    const response = NextResponse.redirect(new URL(testId ? `/tests/${testId}/overview` : '/tests', url), 303);
    for (const [key, value] of Object.entries(privateHeaders)) response.headers.set(key, value);
    response.cookies.set(cookieName(), token, cookieOptions());
    debug.log('redirect_ready', { status: 303 });
    return debug.respond(response);
  } catch (error) {
    debug.failure(stage, error);
    return debug.respond(portalDenied(401, 'Invalid or expired launch link. Open the dashboard again from the Portal.'));
  }
}
