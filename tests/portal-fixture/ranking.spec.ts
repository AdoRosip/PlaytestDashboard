import { test, expect, type Page } from '@playwright/test';
import { createHmac } from 'node:crypto';
import { mapPortalData } from '../../lib/playlytix/mapper';
import { portalGenericConfig } from '../../lib/games/portalGeneric';

// A ranking study ("order these trailers, then tell us why") in the Portal's
// shape. Orders mirror a real test; all text is synthetic.
const ITEMS = ['Long intro', 'No intro', 'Hype intro', 'Short intro'];
const ORDERS = [
  ['Long intro', 'Hype intro', 'Short intro', 'No intro'],
  ['Long intro', 'Hype intro', 'Short intro', 'No intro'],
  ['Hype intro', 'No intro', 'Short intro', 'Long intro'],
  ['Hype intro', 'Long intro', 'Short intro', 'No intro'],
  ['Long intro', 'Hype intro', 'Short intro', 'No intro'],
  ['No intro', 'Long intro', 'Short intro', 'Hype intro'],
  ['Short intro', 'Long intro', 'Hype intro', 'No intro'],
  ['Hype intro', 'Long intro', 'Short intro', 'No intro'],
  ['Long intro', 'Hype intro', 'No intro', 'Short intro'],
  ['Short intro', 'Long intro', 'No intro', 'Hype intro'],
];
const category = { key: 'core-loop', code: 'B', label: 'Core loop' };
const payload = {
  test: { TestID: 7, TestName: 'Trailer test', DueDate: '2026-11-08T23:59:00.000Z', SteamAppID: null, steamMatchGenres: ['Puzzle'], steamMatchModes: ['Co-op'] },
  questions: [
    { QuestionID: 1, QuestionText: 'Please watch these trailers', DisplayOrder: 1, TypeName: 'SectionHeader', Category: { key: 'first-contact', code: 'A', label: 'First contact and clarity' }, Scale: null, Items: null },
    { QuestionID: 2, QuestionText: '**Long intro:** https://example.test/long', DisplayOrder: 2, TypeName: 'InfoBlock', Category: null, Scale: null, Items: null },
    { QuestionID: 3, QuestionText: 'Put the trailers in order from the best to worst.', QuestionDescription: 'The trailer names are in front of the links.', DisplayOrder: 3, TypeName: 'Ranking', Category: category, Scale: null, Options: null, Items: ITEMS.map(name => ({ name, url: '' })) },
    { QuestionID: 4, QuestionText: 'Please explain why you chose the order you did.', QuestionDescription: 'Focus on the intros.', DisplayOrder: 4, TypeName: 'LongText', Category: category, Scale: null, Items: null },
  ],
  responses: ORDERS.map((order, i) => ({
    responseId: 200 + i, submittedAt: `2026-11-0${7 + (i % 2)}T1${i}:00:00.000Z`, evaluationScore: null, payoutStatus: 'Pending',
    tester: { anonymous: true, username: null, country: 'Slovakia', gender: 'Female', ageRange: '25–34', platforms: ['PC / Mac'] },
    answers: [
      { questionId: 3, value: order },
      { questionId: 4, value: `Synthetic reason ${i}: ${order[0]} hooked me fastest.\n${order[3]} felt the weakest.` },
    ],
    files: [], comments: [],
  })),
  stats: { totalResponses: 10, ratingAverages: {}, durationAverages: {}, rankingResults: {} },
};

const analysis = {
  summary: 'Testers preferred the Long intro for its comedic build-up; the No intro version felt generic.',
  themes: [{ label: 'Hook speed', insight: 'Short, punchy openings keep attention.' }],
  highlights: [], actionable: 'Keep the Long intro opening but trim its middle.', segmentInsights: [],
  optionInsights: ITEMS.map(option => ({ option, liked: `Liked about ${option}.`, disliked: `Disliked about ${option}.` })),
};

function launch(client = 7) {
  const token = Buffer.from(JSON.stringify({ d: client, e: Math.floor(Date.now() / 1000) + 300 })).toString('base64url');
  const signature = createHmac('sha256', 'fixture-launch-secret-for-browser-test-only').update(token).digest('base64url');
  return `/tests/7?token=${token}.${signature}`;
}

async function open(page: Page) {
  const aiRequests: { rankingContext?: { byTester: Record<string, string[]> } }[] = [];
  await page.route('**/api/portal/tests/7', route => route.fulfill({ json: mapPortalData(payload, '7', '7', portalGenericConfig) }));
  await page.route('**/api/question-analysis', async route => {
    aiRequests.push(route.request().postDataJSON());
    await route.fulfill({ json: analysis });
  });
  await page.goto(launch());
  await expect(page).toHaveURL(/\/tests\/7\/overview$/);
  return aiRequests;
}

const shot = (page: Page, name: string) =>
  process.env.SCREENSHOT_DIR ? page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/${name}.png`, fullPage: true }) : undefined;

test('a ranking study tells its story on the overview', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const aiRequests = await open(page);

  await expect(page.getByText('Ranking test', { exact: true })).toBeVisible();
  // One stacked bar per trailer, best average place first.
  const bars = page.getByRole('list', { name: 'Places each item was given' }).getByRole('listitem');
  await expect(bars).toHaveCount(4);
  for (const [i, name] of ['Long intro', 'Hype intro', 'Short intro', 'No intro'].entries()) {
    await expect(bars.nth(i)).toContainText(name);
  }
  await expect(page.getByRole('button', { name: 'Long intro ranked 1st by 4 of 10 testers (40%)' })).toBeVisible();
  // The same numbers as a heatmap, one click away.
  await page.getByRole('button', { name: 'Heatmap', exact: true }).click();
  await expect(page.getByRole('table').getByRole('rowheader')).toHaveText(['Long intro', 'Hype intro', 'Short intro', 'No intro']);
  await shot(page, 'ranking-heatmap');
  await page.getByRole('button', { name: 'Bar chart', exact: true }).click();
  await expect(page.getByText(/leads with an average place of 1\.8/)).toBeVisible();

  // The AI reads every answer beside the tester's own order.
  await expect(page.getByText('Testers preferred the Long intro', { exact: false })).toBeVisible();
  await expect(page.getByText('Liked about Hype intro.', { exact: true })).toBeVisible();
  expect(Object.keys(aiRequests[0].rankingContext!.byTester)).toHaveLength(10);
  await shot(page, 'ranking-overview');

  // A cell narrows the reasons to the testers behind it.
  await page.getByRole('button', { name: 'Hype intro ranked 1st by 3 of 10 testers (30%)' }).click();
  await expect(page.getByText(/^Synthetic reason/)).toHaveCount(3);
  await expect(page.getByText('3 matching testers')).toBeVisible();
  await shot(page, 'ranking-filtered');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: /Showing Hype intro in 1st/ }).click();
  await expect(page.getByText(/^Synthetic reason/)).toHaveCount(10);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await shot(page, 'ranking-mobile');
  await page.getByRole('button', { name: 'Heatmap', exact: true }).click();
  await expect(page.getByRole('table')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await shot(page, 'ranking-mobile-heatmap');
  expect(errors).toEqual([]);
});

test('a ranking question shows its results on the question page', async ({ page }) => {
  await open(page);
  await page.getByRole('link', { name: 'All Questions', exact: true }).click();
  await expect(page).toHaveURL(/\/tests\/7\/questions$/);
  await page.getByRole('link', { name: /^Put the trailers in order/ }).click();
  await expect(page).toHaveURL(/\/questions\/portal_7_7_q_3$/, { timeout: 30000 });
  await expect(page.getByText('Ranking Results', { exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('button', { name: 'No intro ranked 4th by 6 of 10 testers (60%)' })).toBeVisible();
  await shot(page, 'ranking-question');
});
