import nextEnv from '@next/env';
import { PortalConfigurationError, validatePortalEnvironment } from '../lib/server/portalConfig.mjs';

nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const conditional = process.argv.includes('--if-production');
if (!conditional || process.env.VERCEL_ENV === 'production' || process.env.PORTAL_MODE === 'true') {
  try {
    validatePortalEnvironment(process.env);
    console.log('Portal configuration passed (no credentials printed).');
  } catch (error) {
    console.error('Portal configuration failed:', error instanceof PortalConfigurationError ? error.message : 'INVALID_CONFIGURATION');
    console.error('See docs/portal-production.md for the required environment variables.');
    process.exitCode = 1;
  }
}
