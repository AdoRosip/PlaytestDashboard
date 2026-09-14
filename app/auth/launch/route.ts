import { NextResponse } from 'next/server';
import { cookieName, cookieOptions, issueSession, portalDenied, portalMode, privateHeaders, verifyLaunch } from '@/lib/server/portalAuth';

export function GET(request: Request) {
  if (!portalMode()) return portalDenied(404);
  const url = new URL(request.url);
  // A Proxy rewrite retains the original incoming URL in some Next runtimes.
  const testId = url.searchParams.get('testId') ?? url.pathname.match(/^\/tests\/([1-9]\d*)$/)?.[1] ?? null;
  if (testId !== null && !/^[1-9]\d*$/.test(testId)) return portalDenied(400, 'Invalid test.');
  try {
    if (url.searchParams.getAll('token').length !== 1) return portalDenied();
    const clientId = verifyLaunch(url.searchParams.get('token') || '');
    const { token } = issueSession(clientId);
    const response = NextResponse.redirect(new URL(testId ? `/tests/${testId}/overview` : '/tests', url), 303);
    for (const [key, value] of Object.entries(privateHeaders)) response.headers.set(key, value);
    response.cookies.set(cookieName(), token, cookieOptions());
    return response;
  } catch { return portalDenied(401, 'Invalid or expired launch link. Open the dashboard again from the Portal.'); }
}
