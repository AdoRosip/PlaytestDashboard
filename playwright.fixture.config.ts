import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/portal-fixture', workers: 1, fullyParallel: false,
  timeout: 60000,
  use: {
    baseURL: 'http://localhost:3101', channel: process.env.CI ? undefined : 'msedge',
    headless: true, trace: 'off', screenshot: 'off', video: 'off',
  },
  webServer: {
    command: 'npm run dev -- --port 3101', url: 'http://localhost:3101/portal-entry',
    reuseExistingServer: false, timeout: 120000,
    env: {
      PLAYWRIGHT_TEST_DIST_DIR: '.next-fixture',
      VERCEL_ENV: 'preview', PORTAL_MODE: 'true', PORTAL_DEBUG: 'false',
      PLAYLYTIX_API_BASE_URL: 'https://portal-fixture.invalid/api',
      PLAYLYTIX_CLIENT_KEYS: JSON.stringify({
        '7': 'fixture-client-seven-key-for-browser-test-only',
        '9': 'fixture-client-nine-key-for-browser-test-only',
      }),
      PLAYLYTIX_TEST_GAME_MAP: '{}',
      DASHBOARD_SSO_SECRET: 'fixture-launch-secret-for-browser-test-only',
      DASHBOARD_SESSION_SECRET: 'fixture-session-secret-for-browser-test-only',
      // Portal pages auto-run AI; never let a test reach the paid model with a local key.
      OPENAI_API_KEY: '',
    },
  },
});
