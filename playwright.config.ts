import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/portal', workers: 1, fullyParallel: false,
  timeout: 60000,
  use: { baseURL: 'http://localhost:3100', channel: 'msedge', headless: true, trace: 'off', screenshot: 'off', video: 'off' },
});
