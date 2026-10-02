// Shared by the server and the deployment preflight. Errors contain codes only.
export class PortalConfigurationError extends Error {}

/** @param {Record<string, string | undefined>} env */
export function configuredClientKeys(env = process.env) {
  let keys;
  try { keys = JSON.parse(env.PLAYLYTIX_CLIENT_KEYS || '{}'); }
  catch { throw new PortalConfigurationError('CLIENT_KEYS_INVALID_JSON'); }
  if (!keys || typeof keys !== 'object' || Array.isArray(keys) || !Object.keys(keys).length ||
    !Object.entries(keys).every(([id, key]) => /^[1-9]\d*$/.test(id) &&
      Number.isSafeInteger(Number(id)) && typeof key === 'string' && key.length >= 32 && key.trim() === key)) {
    throw new PortalConfigurationError('CLIENT_KEYS_INVALID_CONFIGURATION');
  }
  return /** @type {Record<string, string>} */ (keys);
}

/** @param {Record<string, string | undefined>} env */
export function portalApiBase(env = process.env) {
  let base;
  try { base = new URL(env.PLAYLYTIX_API_BASE_URL || ''); }
  catch { throw new PortalConfigurationError('API_BASE_URL_INVALID'); }
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) {
    throw new PortalConfigurationError('API_BASE_URL_INVALID');
  }
  const url = base.href.replace(/\/$/, '');
  if (env.VERCEL_ENV === 'production' && url !== 'https://app.playlytix.gg/api') {
    throw new PortalConfigurationError('PRODUCTION_API_BASE_URL_REQUIRED');
  }
  return url;
}

/** @param {Record<string, string | undefined>} env */
export function validatePortalEnvironment(env = process.env) {
  if (env.PORTAL_MODE !== 'true') throw new PortalConfigurationError('PORTAL_MODE_MUST_BE_TRUE');
  portalApiBase(env);
  configuredClientKeys(env);
  for (const name of ['DASHBOARD_SSO_SECRET', 'DASHBOARD_SESSION_SECRET']) {
    const value = env[name];
    if (!value || value.length < 32 || value.trim() !== value) {
      throw new PortalConfigurationError(`${name}_MISSING_OR_INVALID`);
    }
  }
  if (env.DASHBOARD_SSO_SECRET === env.DASHBOARD_SESSION_SECRET) {
    throw new PortalConfigurationError('SESSION_SECRET_MUST_BE_SEPARATE');
  }
  let map;
  try { map = JSON.parse(env.PLAYLYTIX_TEST_GAME_MAP || '{}'); }
  catch { throw new PortalConfigurationError('TEST_GAME_MAP_INVALID'); }
  if (!map || typeof map !== 'object' || Array.isArray(map) ||
    !Object.entries(map).every(([key, value]) => /^[1-9]\d*:[1-9]\d*$/.test(key) && typeof value === 'string' && value.length)) {
    throw new PortalConfigurationError('TEST_GAME_MAP_INVALID');
  }
}
