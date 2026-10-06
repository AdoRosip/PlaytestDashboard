import { test, expect } from '@playwright/test';
import { createHmac } from 'node:crypto';
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());
// Read-only QA checks. Requires a locally running Portal-mode server on port 3100.
function launch(client: number, testId: number) {
  const secret = process.env.DASHBOARD_SSO_SECRET;
  if (!secret) throw new Error('Configure local Portal credentials first');
  const payload = Buffer.from(JSON.stringify({ d: client, e: Math.floor(Date.now() / 1000) + 300 })).toString('base64url');
  return `/tests/${testId}?token=${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
}
test('anonymous routes deny data and invalid launch links cannot create sessions', async ({ request }) => {
  expect((await request.get('/api/portal/tests')).status()).toBe(401);
  expect((await request.post('/api/overview-insights', { data: {} })).status()).toBe(401);
  expect((await request.get('/tests/32?token=invalid')).status()).toBe(401);
});
test('real QA report loads, stays scoped during navigation and stores no dataset', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(launch(18, 32));
  await expect(page).toHaveURL(/\/tests\/32\/overview$/);
  await expect(page.getByText('2 submissions received.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('playtest-dashboard-v1'))).toBeNull();
  await page.getByRole('link', { name: 'All Questions', exact: true }).click();
  await expect(page).toHaveURL(/\/tests\/32\/questions$/);
  await expect(page.getByText('How fun was the tutorial?', { exact: true }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByText('2 submissions received.', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/portal-entry$/);
  expect((await page.request.get('/api/portal/session')).status()).toBe(401);
});
test('session selects the correct live client and cannot read the other test', async ({ request }) => {
  for (const [client, ownTest, otherTest] of [[18, 32, 28], [2, 28, 32]]) {
    const response = await request.get(launch(client, ownTest), { maxRedirects: 0 });
    expect(response.status()).toBe(303);
    expect(response.headers()['cache-control']).toContain('no-store');
    const { sid } = await (await request.get('/api/portal/session')).json();
    const headers = { 'x-portal-session': sid };
    const own = await request.get(`/api/portal/tests/${ownTest}`, { headers });
    expect(own.status()).toBe(200);
    const dto = await own.json();
    expect(dto.project.id).toBe(`portal_${client}_${ownTest}`);
    expect(dto.testers.every((t: { email: string; rawProfileJson: object }) => !t.email && Object.keys(t.rawProfileJson).length === 0)).toBe(true);
    expect((await request.get(`/api/portal/tests/${otherTest}`, { headers })).status()).toBe(404);
    expect((await request.post('/api/testers/match', { data: { emails: ['nobody@example.test'] } })).status()).toBe(403);
  }
});
test('replacing the cookie invalidates the old tab before it can fetch with the new client', async ({ page }) => {
  await page.goto(launch(18, 32));
  await expect(page.getByText('2 submissions received.', { exact: true })).toBeVisible();
  const { sid } = await (await page.request.get('/api/portal/session')).json();
  await page.request.get(launch(2, 28), { maxRedirects: 0 });
  expect((await page.request.get('/api/portal/tests/28', { headers: { 'x-portal-session': sid } })).status()).toBe(409);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('alert').filter({ hasText: 'session changed or expired' })).toBeVisible();
  await expect(page.getByText('2 submissions received.', { exact: true })).toHaveCount(0);
});
