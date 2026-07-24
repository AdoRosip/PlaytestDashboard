import { describe, it, expect } from 'vitest';
import { mapPlaylytixTestToParseResult } from './mapper';
import type { GameConfig } from '../games';
import type { PlaylytixTestResponsesPayload } from './types';

// Minimal test config — real category rules live in lib/games/exovia.ts and
// lib/games/wannabeTrashman.ts; this fixture only needs enough to exercise the
// mapper's own logic (skipping section headers, inverse scoring, category
// assignment plumbing), not any particular game's real rules.
const testConfig: GameConfig = {
  id: 'test_game',
  gameName: 'Test Game',
  categories: [
    { id: 'cat_tutorial', projectId: 'proj_import', name: 'Tutorial', description: '', order: 1, color: '#000' },
    { id: 'cat_other', projectId: 'proj_import', name: 'Other', description: '', order: 2, color: '#000' },
  ],
  categoryRules: [['cat_tutorial', /tutorial/i]],
  inverseScoringPatterns: [/frustrat/i],
  kpis: [],
  filters: {},
  overviewMode: 'scoring',
};

// Trimmed version of the example payload from api-reference.html (`GET
// /api/tests/28/responses`) — one opted-in tester, one anonymized.
const examplePayload: PlaylytixTestResponsesPayload = {
  test: { TestID: 28, TestName: 'API Demo — Sample Playtest', DueDate: null },
  questions: [
    { QuestionID: 43, QuestionText: 'First impressions', QuestionDescription: null, DisplayOrder: 1, TypeName: 'SectionHeader' },
    { QuestionID: 44, QuestionText: 'How fun was the tutorial?', QuestionDescription: '1 = a slog, 5 = loved it.', DisplayOrder: 2, TypeName: 'Rating1_5' },
    { QuestionID: 45, QuestionText: 'One word for the art style', QuestionDescription: null, DisplayOrder: 3, TypeName: 'ShortText' },
    { QuestionID: 46, QuestionText: 'Link to a highlight clip', QuestionDescription: 'YouTube, Streamable, anything.', DisplayOrder: 4, TypeName: 'URL' },
    { QuestionID: 48, QuestionText: 'Describe any bugs you hit', QuestionDescription: 'Repro steps help.', DisplayOrder: 6, TypeName: 'LongText' },
    { QuestionID: 49, QuestionText: 'Attach a clip or screenshot', QuestionDescription: null, DisplayOrder: 7, TypeName: 'File' },
  ],
  responses: [
    {
      responseId: 23,
      submittedAt: '2026-07-08T17:16:50.013Z',
      evaluationScore: 9,
      payoutAmount: 22.5,
      payoutStatus: 'Paid',
      tester: {
        anonymous: false,
        email: 'nova@demo.playlytix.local',
        country: 'United States', gender: 'Female', ageRange: '25-34',
        gpu: 'RTX 4070', cpu: 'Ryzen 7 5800X', ram: '32 GB',
        platforms: 'PC / Mac, VR', gamerType: 'Explorer', gamingPreferences: 'RPG, Roguelike',
      },
      answers: [
        { questionId: 44, value: '5' },
        { questionId: 45, value: 'Vibrant' },
        { questionId: 46, value: 'https://youtu.be/demo-nova' },
        { questionId: 48, value: 'Great pacing; minimap overlaps objective text at 1440p.' },
      ],
      files: [
        { questionId: 49, fileName: 'nova-map.png', contentType: 'image/png', sizeBytes: '815', url: 'https://signed/1' },
      ],
      comments: [{ text: 'The audio cut out once after alt-tabbing.', createdAt: '2026-07-08T17:16:50.020Z' }],
    },
    {
      responseId: 24,
      submittedAt: '2026-07-08T17:16:50.027Z',
      evaluationScore: 7,
      payoutAmount: 12,
      payoutStatus: 'Pending',
      tester: {
        anonymous: true,
        email: null,
        country: 'Germany', gender: 'Male', ageRange: '18-24',
        gpu: 'RTX 3060', cpu: 'i5-12400F', ram: '16 GB',
        platforms: 'PC / Mac', gamerType: 'Competitive', gamingPreferences: 'FPS, Strategy',
      },
      answers: [
        { questionId: 44, value: '4' },
        { questionId: 45, value: 'Gritty' },
        { questionId: 48, value: 'Got stuck on objective 2 — no waypoint. Crash on quit.' },
      ],
      files: [],
      comments: [],
    },
  ],
  stats: { totalResponses: 2, ratingAverages: { '44': 4.5 } },
};

describe('mapPlaylytixTestToParseResult', () => {
  it('skips SectionHeader questions entirely', () => {
    const result = mapPlaylytixTestToParseResult(examplePayload, testConfig);
    expect(result.questions.find((q) => q.id === 'q_43')).toBeUndefined();
    expect(result.questions).toHaveLength(5);
  });

  it('maps question types and assigns categories via the game config rules', () => {
    const result = mapPlaylytixTestToParseResult(examplePayload, testConfig);
    const tutorial = result.questions.find((q) => q.id === 'q_44')!;
    expect(tutorial.type).toBe('rating_1_5');
    expect(tutorial.scaleMin).toBe(1);
    expect(tutorial.scaleMax).toBe(5);
    expect(tutorial.categoryId).toBe('cat_tutorial'); // "How fun was the tutorial?" matches /tutorial/i

    const file = result.questions.find((q) => q.id === 'q_49')!;
    expect(file.type).toBe('file_upload');

    const shortText = result.questions.find((q) => q.id === 'q_45')!;
    expect(shortText.type).toBe('free_text');
    expect(shortText.categoryId).toBeNull(); // no rule matches "art style"
  });

  it('produces one tester + one response row per answer, keyed by responseId', () => {
    const result = mapPlaylytixTestToParseResult(examplePayload, testConfig);
    expect(result.testers).toHaveLength(2);
    // 4 answers for response 23, 3 for response 24
    expect(result.responses).toHaveLength(7);
    expect(result.responses.every((r) => r.matchStatus === 'matched')).toBe(true);
  });

  it('redacts email and labels the tester "Anonymous" when tester.anonymous is true', () => {
    const result = mapPlaylytixTestToParseResult(examplePayload, testConfig);
    const anon = result.testers.find((t) => t.id === 'tstr_playlytix_24')!;
    expect(anon.email).toBe('');
    expect(anon.testerId).toMatch(/^Anonymous/);
    // Demographics are still present — only identity is stripped.
    expect(anon.country).toBe('Germany');

    const named = result.testers.find((t) => t.id === 'tstr_playlytix_23')!;
    expect(named.email).toBe('nova@demo.playlytix.local');
  });

  it('derives a hardware tier from gpu/ram same as the Excel importer', () => {
    const result = mapPlaylytixTestToParseResult(examplePayload, testConfig);
    const nova = result.testers.find((t) => t.id === 'tstr_playlytix_23')!;
    expect(nova.segments.hardware_tier).toBe('High'); // RTX 4070
  });

  it('flags an inverse-scored rating question via the game config pattern', () => {
    const frustrationPayload: PlaylytixTestResponsesPayload = {
      ...examplePayload,
      questions: [
        { QuestionID: 90, QuestionText: 'How frustrated did you feel?', QuestionDescription: null, DisplayOrder: 1, TypeName: 'Rating1_5' },
      ],
    };
    const result = mapPlaylytixTestToParseResult(frustrationPayload, testConfig);
    expect(result.questions[0].isInverseScored).toBe(true);
  });

  it('warns about anonymized testers and skipped section headers', () => {
    const result = mapPlaylytixTestToParseResult(examplePayload, testConfig);
    expect(result.warnings.some((w) => w.includes('Anonymous'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('section header'))).toBe(true);
  });
});
