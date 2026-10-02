import { test, expect, type Page } from '@playwright/test';
import { createHmac } from 'node:crypto';
import { mapPortalData } from '../../lib/playlytix/mapper';
import { portalGenericConfig } from '../../lib/games/portalGeneric';
import { dossierFixture } from '../fixtures/tester-dossier';

async function openTest(page: Page, adjust?: (data: ReturnType<typeof mapPortalData>) => void) {
  const data = mapPortalData(dossierFixture(), '7', '18', portalGenericConfig);
  adjust?.(data);
  await page.route('**/api/portal/tests/18', route => route.fulfill({ json: data }));
  await page.route('https://media.example.test/**', route => route.abort());
  const payload = Buffer.from(JSON.stringify({ d: 7, e: Math.floor(Date.now() / 1000) + 300 })).toString('base64url');
  const sig = createHmac('sha256', 'fixture-launch-secret-for-browser-test-only').update(payload).digest('base64url');
  await page.goto(`/tests/18?token=${payload}.${sig}`);
  await expect(page.getByText('2 submissions received.', { exact: true })).toBeVisible();
  await page.goto('/tests/18/testers');
  await expect(page.getByRole('link', { name: 'Tester-28', exact: true })).toBeVisible();
}

test('tester list opens the dossier, keeps filters, paginates and persists tabs', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openTest(page);
  await page.getByRole('link', { name: 'Tester-28', exact: true }).click();
  await expect(page).toHaveURL(/\/tests\/18\/testers\/portal_7_18_s_28$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Tester-28', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Answers 26' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Videos 1' })).toBeVisible();
  await page.screenshot({ path: 'test-results/dossier-desktop.png' });
  await expect(page.getByRole('meter').first()).toHaveAttribute('aria-label', 'Rated 1 of 5, group average 3.0');
  await expect(page.getByText('avg 3.0').first()).toHaveCSS('color', 'rgb(201, 162, 39)');
  await expect(page.getByText('168 games · 3,755 h')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Setup', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: 'Setup', exact: true }).click();
  await expect(page.getByText('RTX 3070', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '6 more answers' }).click();
  await expect(page.getByText('Question 26', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Written \d+$/ }).click();
  await expect(page.getByRole('meter')).toHaveCount(0);
  await expect(page.getByText('Second line of feedback.', { exact: false }).first()).toBeVisible();
  await page.getByRole('tab', { name: 'Videos 1' }).click();
  await expect(page).toHaveURL(/tab=videos/);
  await expect(page.getByText("This video can't be played in the browser")).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Videos 1' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: /Linked answer/ }).click();
  await expect(page.getByRole('tab', { name: 'Answers 26' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-answer-id="portal_7_18_s_28_portal_7_18_q_955"]')).toBeFocused();
  expect(await page.locator('body').innerText()).not.toMatch(/hidden-user|evaluationScore|payoutStatus|@/);
  await page.getByRole('link', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tester-29' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
  await page.getByRole('link', { name: 'Testers', exact: true }).last().click();
  await page.getByPlaceholder('Search by tester ID…').fill('29');
  await page.getByRole('link', { name: 'Tester-29', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Prev', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
  await page.getByRole('link', { name: 'Testers', exact: true }).last().click();
  await expect(page).toHaveURL(/\/tests\/18\/testers\?search=29$/);
  await expect(page.getByPlaceholder('Search by tester ID…')).toHaveValue('29');
  expect(errors).toEqual([]);
});

test('dialog retains focus, keyboard tabs, scroll lock and empty videos', async ({ page }) => {
  await openTest(page, data => { data.testers[0].files = []; });
  const trigger = page.getByRole('button', { name: 'Quick view Tester-28' });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Tester-28' });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close tester profile' })).toBeFocused();
  expect(await page.locator('body').evaluate(el => el.style.overflow)).toBe('hidden');
  await dialog.getByRole('tab', { name: 'Answers 26' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(dialog.getByRole('tab', { name: 'Videos 0' })).toBeFocused();
  await expect(dialog.getByText('No recordings uploaded.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(await page.locator('body').evaluate(el => el.style.overflow)).not.toBe('hidden');
});

test('375px detail has no horizontal overflow and respects registry tri-state', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openTest(page, data => { data.testers[0].inRegistry = undefined; data.testers[1].inRegistry = false; });
  await page.getByRole('link', { name: 'Tester-28', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tester-28' })).toBeVisible();
  await expect(page.getByText('profile data unavailable', { exact: true })).toBeVisible();
  await expect(page.getByText('No registry profile', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Setup', exact: true })).toHaveCount(0);
  await expect(page.getByText('Submitted', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/dossier-mobile.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('tab', { name: 'Videos 1' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('link', { name: 'Next', exact: true }).click();
  await expect(page.getByText('No registry profile', { exact: true })).toBeVisible();
  await expect(page.getByText('Submitted', { exact: true })).toHaveCount(0);
});

test('cohort averages update on the detail page and existing profile buttons still open the dialog', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openTest(page, data => { data.testers[1].segments.gender = 'Female'; });
  await page.getByRole('link', { name: 'Tester-28', exact: true }).click();
  await page.getByRole('button', { name: 'Male', exact: true }).first().click();
  await expect(page.getByRole('meter').first()).toHaveAttribute('aria-label', 'Rated 1 of 5, group average 1.0');
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
  await page.getByRole('link', { name: 'Responses', exact: true }).click();
  const responseTrigger = page.getByRole('button', { name: 'Profile →', exact: true }).first();
  await responseTrigger.click();
  await expect(page.getByRole('dialog', { name: 'Tester-28' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(responseTrigger).toBeFocused();
  await page.goto('/tests/18/questions/portal_7_18_q_950');
  const questionTrigger = page.getByRole('button', { name: 'Profile →', exact: true }).first();
  await questionTrigger.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('tab', { name: 'Videos 1' })).toBeVisible();
});

test('native playback reads metadata, captures thumbnails and selects recordings by keyboard', async ({ page }) => {
  await openTest(page, data => {
    const file = data.testers[0].files![0];
    data.testers[0].files = [{ ...file, id: 'first', title: 'First recording', durationSec: 61 }, { ...file, id: 'second', title: 'Second recording', durationSec: 59 }];
  });
  // Generate a tiny local recording, avoiding large external videos and expiring URLs.
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 180;
    const context = canvas.getContext('2d')!;
    document.body.append(canvas);
    const stream = canvas.captureStream(0);
    const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
    const chunks: Blob[] = [];
    const complete = new Promise<number[]>(resolve => {
      recorder.ondataavailable = event => chunks.push(event.data);
      recorder.onstop = async () => { stream.getTracks().forEach(t => t.stop()); canvas.remove(); resolve(Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()))); };
    });
    recorder.start();
    let frame = 0;
    const timer = setInterval(() => {
      context.fillStyle = frame++ % 2 ? '#151920' : '#0b0d10'; context.fillRect(0, 0, 320, 180);
      context.fillStyle = '#4c7dff'; context.fillRect(frame * 10, 50, 40, 40);
      track.requestFrame();
      if (frame === 12) { clearInterval(timer); recorder.stop(); }
    }, 100);
    return complete;
  });
  expect(bytes.length).toBeGreaterThan(500);
  await page.route('https://media.example.test/recording.mp4', route => route.fulfill({ body: Buffer.from(bytes), contentType: 'video/webm', headers: { 'Access-Control-Allow-Origin': '*' } }));
  await page.getByRole('link', { name: 'Tester-28', exact: true }).click();
  await page.getByRole('tab', { name: 'Videos 2' }).click();
  await expect(page.getByText('2 min total', { exact: true })).toBeVisible();
  await expect(page.getByText(/320 × 180/)).toBeVisible();
  const first = page.getByRole('option', { name: 'First recording' });
  await expect(first.locator('img')).toBeVisible();
  await first.focus(); await page.keyboard.press('ArrowDown');
  const second = page.getByRole('option', { name: 'Second recording' });
  await expect(second).toBeFocused();
  await expect(first).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Enter');
  await expect(second).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: 'Second recording' })).toBeVisible();
  const video = page.locator('video');
  expect(await video.evaluate((el: HTMLVideoElement) => el.paused && !el.autoplay)).toBe(true);
  await video.evaluate((el: HTMLVideoElement) => { el.muted = true; return el.play(); });
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeGreaterThan(0);
  await page.screenshot({ path: 'test-results/dossier-videos.png' });
});
