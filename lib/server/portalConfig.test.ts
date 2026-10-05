import { describe, expect, it } from 'vitest';
import { configuredClientKeys, portalApiBase, validatePortalEnvironment } from './portalConfig.mjs';

const production = {
  VERCEL_ENV: 'production', PORTAL_MODE: 'true',
  PLAYLYTIX_API_BASE_URL: 'https://app.playlytix.gg/api',
  PLAYLYTIX_CLIENT_KEYS: JSON.stringify({ '7': 'a'.repeat(64), '9': 'b'.repeat(64) }),
  DASHBOARD_SSO_SECRET: 'fixture-launch-secret-'.repeat(3),
  DASHBOARD_SESSION_SECRET: 'fixture-session-secret-'.repeat(3),
};

describe('production deployment configuration', () => {
  it('accepts the multi-client production map and existing QA map', () => {
    expect(() => validatePortalEnvironment(production)).not.toThrow();
    expect(configuredClientKeys(production)).toEqual({ '7': 'a'.repeat(64), '9': 'b'.repeat(64) });
    expect(configuredClientKeys({ PLAYLYTIX_CLIENT_KEYS: JSON.stringify({ '2': 'a'.repeat(64) }) })).toEqual({ '2': 'a'.repeat(64) });
  });
  it('requires a valid nonempty map and never falls back to a standalone key', () => {
    expect(() => configuredClientKeys({ PORTAL_API_KEY: 'a'.repeat(64), PORTAL_CLIENT_ID: '7' })).toThrow('CLIENT_KEYS_INVALID_CONFIGURATION');
    expect(() => configuredClientKeys({ PLAYLYTIX_CLIENT_KEYS: '{}' })).toThrow('CLIENT_KEYS_INVALID_CONFIGURATION');
    expect(() => configuredClientKeys({ PLAYLYTIX_CLIENT_KEYS: JSON.stringify({ '18x': 'a'.repeat(64) }) })).toThrow();
  });
  it.each(['', 'false', 'TRUE'])('rejects a disabled or mistyped production switch (%s)', PORTAL_MODE => {
    expect(() => validatePortalEnvironment({ ...production, PORTAL_MODE })).toThrow('PORTAL_MODE_MUST_BE_TRUE');
  });
  it.each(['https://qa.playlytix.gg/api', 'http://app.playlytix.gg/api', 'https://app.playlytix.gg', 'https://app.playlytix.gg/api?key=secret'])('rejects the wrong production API URL: %s', PLAYLYTIX_API_BASE_URL => {
    expect(() => validatePortalEnvironment({ ...production, PLAYLYTIX_API_BASE_URL })).toThrow();
  });
  it('keeps QA Preview supported, and accepts a trailing slash', () => {
    expect(portalApiBase({ VERCEL_ENV: 'preview', PLAYLYTIX_API_BASE_URL: 'https://qa.playlytix.gg/api' })).toBe('https://qa.playlytix.gg/api');
    expect(portalApiBase({ ...production, PLAYLYTIX_API_BASE_URL: production.PLAYLYTIX_API_BASE_URL + '/' })).toBe(production.PLAYLYTIX_API_BASE_URL);
  });
  it('requires independent secrets and validates optional game mappings', () => {
    expect(() => validatePortalEnvironment({ ...production, DASHBOARD_SESSION_SECRET: '' })).toThrow();
    expect(() => validatePortalEnvironment({ ...production, DASHBOARD_SESSION_SECRET: production.DASHBOARD_SSO_SECRET })).toThrow('SEPARATE');
    expect(() => validatePortalEnvironment({ ...production, PLAYLYTIX_TEST_GAME_MAP: '[]' })).toThrow('TEST_GAME_MAP_INVALID');
  });
});
