import { timingSafeEqual } from 'node:crypto';

function safeEqual(actual: string, expected: string): boolean {
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function challenge(message = 'Authentication required.'): Response {
  return new Response(message, {
    status: 401,
    headers: {
      'Cache-Control': 'no-store',
      'WWW-Authenticate': 'Basic realm="Playlytix Dashboard", charset="UTF-8"',
    },
  });
}

/**
 * Protect the dashboard and its service-role/API-key-backed handlers with HTTP
 * Basic authentication. Development remains frictionless, but production
 * fails closed unless both credentials are configured.
 */
export function requireDashboardAuth(request: Request): Response | null {
  const expectedUser = process.env.DASHBOARD_USERNAME;
  const expectedPassword = process.env.DASHBOARD_PASSWORD;

  if (!expectedUser || !expectedPassword) {
    if (process.env.NODE_ENV !== 'production') return null;
    return new Response(
      'Dashboard authentication is not configured. Set DASHBOARD_USERNAME and DASHBOARD_PASSWORD.',
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const header = request.headers.get('authorization');
  if (!header?.startsWith('Basic ')) return challenge();

  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    if (separator < 0) return challenge();
    const username = decoded.slice(0, separator);
    const password = decoded.slice(separator + 1);
    if (!safeEqual(username, expectedUser) || !safeEqual(password, expectedPassword)) {
      return challenge('Invalid credentials.');
    }
  } catch {
    return challenge();
  }

  return null;
}
