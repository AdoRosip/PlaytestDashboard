import { afterEach, describe, expect, it, vi } from 'vitest';
import { requireDashboardAuth } from './requestAuth';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('requireDashboardAuth', () => {
  it('fails closed in production when credentials are not configured', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DASHBOARD_USERNAME', '');
    vi.stubEnv('DASHBOARD_PASSWORD', '');

    expect(requireDashboardAuth(new Request('https://dashboard.test'))?.status).toBe(503);
  });

  it('challenges missing and incorrect credentials', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DASHBOARD_USERNAME', 'reviewer');
    vi.stubEnv('DASHBOARD_PASSWORD', 'secret');

    const missing = requireDashboardAuth(new Request('https://dashboard.test'));
    expect(missing?.status).toBe(401);
    expect(missing?.headers.get('www-authenticate')).toContain('Basic');

    const incorrect = requireDashboardAuth(new Request('https://dashboard.test', {
      headers: { authorization: `Basic ${Buffer.from('reviewer:wrong').toString('base64')}` },
    }));
    expect(incorrect?.status).toBe(401);
  });

  it('allows the configured credentials', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DASHBOARD_USERNAME', 'reviewer');
    vi.stubEnv('DASHBOARD_PASSWORD', 'secret:with:colons');

    const result = requireDashboardAuth(new Request('https://dashboard.test', {
      headers: {
        authorization: `Basic ${Buffer.from('reviewer:secret:with:colons').toString('base64')}`,
      },
    }));
    expect(result).toBeNull();
  });
});
