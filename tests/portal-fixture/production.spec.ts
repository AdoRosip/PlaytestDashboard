import { test, expect } from '@playwright/test';
import { createHmac } from 'node:crypto';
import { mapPortalData } from '../../lib/playlytix/mapper';
import { portalGenericConfig } from '../../lib/games/portalGeneric';
import fixture from '../fixtures/portal-production-response.json';

// Real Next routing/SSO/session lifecycle; browser data is mocked. Server-to-API
// behavior is covered separately in portalRoutes.test.ts. No live credentials.
function launch(client = 7) {
  const payload = Buffer.from(JSON.stringify({ d: client, e: Math.floor(Date.now() / 1000) + 300 })).toString('base64url');
  const signature = createHmac('sha256', 'fixture-launch-secret-for-browser-test-only').update(payload).digest('base64url');
  return `/tests/18?token=${payload}.${signature}`;
}

test('production response renders through the Portal flow, navigates and signs out', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('playtest-dashboard-v1', JSON.stringify({ state: { project: { name: 'OLD CLIENT DATA' } }, version: 0 })));
  await page.route('**/api/portal/tests/18', route => route.fulfill({ json: mapPortalData(fixture, '7', '18', portalGenericConfig) }));
  await page.goto(launch());
  await expect(page).toHaveURL(/\/tests\/18\/overview$/);
  await expect(page.getByText('1 submissions received.', { exact: true })).toBeVisible();
  await expect(page.getByText('Maradona', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('OLD CLIENT DATA')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('playtest-dashboard-v1'))).toBeNull();
  await page.getByRole('link', { name: 'All Questions', exact: true }).click();
  await expect(page).toHaveURL(/\/tests\/18\/questions$/);
  await expect(page.getByText('asfdsgfdfg', { exact: true })).toBeVisible();
  await page.getByText('asfdsgfdfg', { exact: true }).click();
  await expect(page).toHaveURL(/\/tests\/18\/questions\/portal_7_18_q_37$/);
  await expect(page.getByText('asfdsgfdfg', { exact: true }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByText('1 submissions received.', { exact: true })).toBeVisible();
  await expect(page.getByText('hilmersen', { exact: true }).first()).toBeVisible();
  await page.getByRole('link', { name: 'AI Analysis', exact: true }).click();
  await expect(page).toHaveURL(/\/tests\/18\/themes$/);
  await expect(page.getByText('Ready to analyse', { exact: true })).toBeVisible();
  // A malformed body passes authorization but fails before any paid model call.
  const ai = await page.request.post('/api/question-analysis', { headers: { 'content-type': 'application/json' }, data: 'not json' });
  expect([401, 403]).not.toContain(ai.status());
  expect(errors).toEqual([]);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/portal-entry$/);
  expect((await page.request.get('/api/portal/session')).status()).toBe(401);
});

test('rejects anonymous requests and another client even with a valid signature', async ({ request }) => {
  expect((await request.get('/api/portal/tests/18')).status()).toBe(401);
  expect((await request.get(launch(8), { maxRedirects: 0 })).status()).toBe(401);
  expect((await request.get('/api/portal/session')).status()).toBe(401);
  expect((await request.post('/api/question-analysis', { data: {} })).status()).toBe(401);
});
