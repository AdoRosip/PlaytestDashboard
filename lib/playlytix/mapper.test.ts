import { describe, expect, it } from 'vitest';
import { mapPortalData } from './mapper';
import { portalGenericConfig } from '../games/portalGeneric';
import productionResponse from '../../tests/fixtures/portal-production-response.json';
function fixture() {
  return {
    test: { TestID: 32, TestName: 'QA playtest' },
    questions: [{ QuestionID: 1, QuestionText: 'Fun?', QuestionDescription: 'Rate fun', DisplayOrder: 1, TypeName: 'Rating1_5' }],
    responses: [{ responseId: 7, submittedAt: '2026-09-14T12:00:00Z',
      tester: { anonymous: true, email: 'private@example.test', username: 'private', country: 'SK', gamingPreferences: 'Simulation', steam: { secret: 'private-steam' } },
      payoutAmount: 100, comments: [{ text: 'private-comment' }],
      answers: [{ questionId: 1, value: '4' }], files: [{ url: 'https://private-file.test/token' }],
    }], stats: { totalResponses: 1 },
  };
}
describe('Portal analytics DTO', () => {
  it('maps the production profile through an explicit client-facing allowlist', () => {
    const data = mapPortalData(productionResponse, '7', '18', portalGenericConfig);
    expect(data.project).toMatchObject({ id: 'portal_7_18', name: 'Maradona', totalResponses: 1 });
    expect(data.questions).toHaveLength(1);
    expect(data.questions[0]).toMatchObject({ type: 'rating_1_5', scaleMin: 1, scaleMax: 5, categoryId: null });
    expect(data.responses[0]).toMatchObject({ rawAnswer: '3', numericValue: 3, normalizedScore: 50 });
    expect(data.testers[0]).toMatchObject({ testerId: 'Tester-22', username: 'sample-tester-01', anonymous: false, inRegistry: true, country: 'Slovakia', ageGroup: '25–34', rawProfileJson: {} });
    expect(data.testers[0].segments).toMatchObject({ platform: 'PC / Mac', genres: 'Action, RPG, Simulation / Cozy', gaming_hours: '11–20', has_controller: 'Yes', has_mic: 'Yes' });
    expect(data.testers[0].profile?.steam).toEqual({ gameCount: 168, totalHours: 3755 });
    expect(data.testers[0].comments?.[0].text).toBe('co si jak');
    expect(JSON.stringify(data)).not.toMatch(/payoutStatus|evaluationScore|syncedAt|subscriptions/);
  });
  it('links a video to its transcript only when the Portal reports one', () => {
    const input = fixture();
    input.questions.push({ QuestionID: 412, QuestionText: 'Recording', QuestionDescription: '', DisplayOrder: 2, TypeName: 'File' });
    input.responses[0].files = [
      { questionId: 412, fileName: 'attachment-1.mkv', contentType: 'video/x-matroska', url: 'https://files.test/a', fileId: 9031, transcript: { cues: 1240, durationSeconds: 17980 } },
      { questionId: 412, fileName: 'attachment-2.mp4', contentType: 'video/mp4', url: 'https://files.test/b', fileId: 9032, transcript: null },
    ] as never;
    const files = mapPortalData(input, '18', '32', portalGenericConfig).testers[0].files!;
    expect(files[0].transcript).toEqual({ testId: '32', submissionId: 7, fileId: 9031, cues: 1240, durationSec: 17980 });
    expect(files[1].transcript).toBeUndefined();
  });
  it('keeps each video copy state and leaves images and unknown states without one', () => {
    const input = fixture();
    input.questions.push({ QuestionID: 412, QuestionText: 'Recording', QuestionDescription: '', DisplayOrder: 2, TypeName: 'File' });
    input.responses[0].files = [
      { questionId: 412, fileName: 'a.mp4', contentType: 'video/mp4', url: 'https://files.test/a', videoState: 'ready' },
      { questionId: 412, fileName: 'b.mp4', contentType: 'video/mp4', url: null, videoState: 'preparing' },
      { questionId: 412, fileName: 'c.mkv', contentType: 'video/x-matroska', url: null, videoState: 'unavailable' },
      { questionId: 412, fileName: 'd.mp4', contentType: 'video/mp4', url: null, videoState: 'queued' },
      { questionId: 412, fileName: 'e.png', contentType: 'image/png', url: 'https://files.test/e', videoState: null },
    ] as never;
    const files = mapPortalData(input, '18', '32', portalGenericConfig).testers[0].files!;
    expect(files.map(f => [f.videoState, f.url])).toEqual([
      ['ready', 'https://files.test/a'], ['preparing', undefined], ['unavailable', undefined], [undefined, undefined], [undefined, 'https://files.test/e'],
    ]);
  });
  it('shows answers unscored when a rating scale contradicts its type, and orders a question without a position last', () => {
    const input = structuredClone(productionResponse);
    input.questions[0].Scale.max = 10;
    const data = mapPortalData(input, '7', '18', portalGenericConfig);
    expect(data.questions[0]).toMatchObject({ type: 'unknown', scaleMax: undefined });
    expect(data.responses[0]).toMatchObject({ rawAnswer: '3', normalizedScore: null });
    expect(data.warnings).toContain('A rating scale did not match its question type; its answers are shown unscored.');
    input.questions[0].Scale.max = 5;
    input.questions[0].DisplayOrder = NaN;
    input.questions.unshift({ ...input.questions[0], QuestionID: 2, DisplayOrder: 9 });
    expect(mapPortalData(input, '7', '18', portalGenericConfig).questions.map(q => q.sourceColumn)).toEqual(['2', String(productionResponse.questions[0].QuestionID)]);
  });
  it('allowlists analytics fields and scopes all entity IDs', () => {
    const data = mapPortalData(fixture(), '18', '32', portalGenericConfig);
    expect(JSON.stringify(data)).not.toMatch(/private|payoutAmount|username|steam/);
    expect(data.testers[0].segments.genres).toBe('Simulation');
    expect(data.questions[0].description).toBe('Rate fun');
    expect(data.responses[0].normalizedScore).toBe(75);
    expect(data.project.id).toBe('portal_18_32');
    expect(data.testers[0].id).not.toBe(mapPortalData(fixture(), '2', '32', portalGenericConfig).testers[0].id);
  });
  it('retains file-only and empty submissions in the submission count', () => {
    const input = fixture(); input.responses[0].answers = [];
    const data = mapPortalData(input, '18', '32', portalGenericConfig);
    expect(data.project.totalResponses).toBe(1);
    expect(data.testers).toHaveLength(1);
    expect(data.responses).toHaveLength(0);
  });
  it('accepts numeric answer values such as Duration minutes', () => {
    const input = fixture();
    input.questions.push({ QuestionID: 2, QuestionText: 'How long?', QuestionDescription: '', DisplayOrder: 2, TypeName: 'Duration' });
    (input.responses[0].answers as { questionId: number; value: unknown }[]).push({ questionId: 2, value: 320 });
    const data = mapPortalData(input, '18', '32', portalGenericConfig);
    expect(data.questions.find(q => q.sourceColumn === '2')?.type).toBe('duration');
    expect(data.responses.find(r => r.rawAnswer === '320')).toMatchObject({ numericValue: null, normalizedScore: null });
    expect(data.warnings.join(' ')).not.toContain('Unsupported question type');
  });
  it('keeps choice options in form order and ignores a malformed list', () => {
    const input = fixture();
    input.questions.push(
      { QuestionID: 2, QuestionText: 'Difficulty?', QuestionDescription: '', DisplayOrder: 2, TypeName: 'SingleChoice', Options: ['Too easy', 'About right', 'Too hard'] } as never,
      { QuestionID: 3, QuestionText: 'Mode?', QuestionDescription: '', DisplayOrder: 3, TypeName: 'SingleChoice', Options: [1, 2] } as never,
    );
    const data = mapPortalData(input, '18', '32', portalGenericConfig);
    expect(data.questions[1].options).toEqual(['Too easy', 'About right', 'Too hard']);
    expect(data.questions[2].options).toBeUndefined();
    expect(data.questions[0].options).toBeUndefined();
  });
  it('supports an empty test', () => {
    const input = fixture(); input.responses = []; input.stats.totalResponses = 0;
    expect(mapPortalData(input, '18', '32', portalGenericConfig).testers).toHaveLength(0);
  });
  it('accepts live API multi-select demographics as string arrays', () => {
    const input = fixture();
    const profile = input.responses[0].tester as Record<string, unknown>;
    profile.gamingPreferences = ['Simulation', 'Strategy'];
    profile.platforms = ['PC'];
    expect(mapPortalData(input, '18', '32', portalGenericConfig).testers[0].segments.genres).toBe('Simulation, Strategy');
    profile.platforms = [{ unexpected: true }];
    const data = mapPortalData(input, '18', '32', portalGenericConfig);
    expect(data.testers[0].segments.platform).toBeUndefined();
    expect(data.testers[0].segments.genres).toBe('Simulation, Strategy');
    expect(data.warnings).toContain('Ignored a malformed profile field.');
  });
  it('leaves unknown types and invalid ratings unscored', () => {
    const input = fixture(); input.questions[0].TypeName = 'NewType';
    expect(mapPortalData(input, '18', '32', portalGenericConfig).questions[0].type).toBe('unknown');
    input.questions[0].TypeName = 'Rating1_5'; input.responses[0].answers[0].value = '6';
    expect(mapPortalData(input, '18', '32', portalGenericConfig).responses[0].normalizedScore).toBeNull();
  });
  it('still rejects a payload that is not the requested test', () => {
    expect(() => mapPortalData(fixture(), '18', '33', portalGenericConfig)).toThrow('Unexpected test');
    expect(() => mapPortalData(null, '18', '32', portalGenericConfig)).toThrow();
    expect(() => mapPortalData({ ...fixture(), test: undefined }, '18', '32', portalGenericConfig)).toThrow();
    expect(() => mapPortalData({ ...fixture(), questions: {} }, '18', '32', portalGenericConfig)).toThrow();
    expect(() => mapPortalData({ ...fixture(), responses: null }, '18', '32', portalGenericConfig)).toThrow();
  });
});

// ── Production-shaped payload ────────────────────────────────────────────────
// Mirrors the structure of a live Portal test (section headers with categories,
// labelled agree scales, a File question answered only through files[], a
// Duration answered in minutes or left blank, choices, comments and stats).
// All text and profile values are synthetic.

type Row = Record<string, unknown>;
interface Payload { test: Row; questions: Row[]; responses: (Row & { tester: Row; answers: Row[] })[]; stats?: Row }

const category = (code: string, label: string) => ({ key: `cat-${code.toLowerCase()}`, code, label });
const agree = { min: 1, max: 5, labels: ['Strongly disagree', 'Disagree', 'Neither agree nor disagree', 'Agree', 'Strongly agree'] };

function productionShaped(): Payload {
  const submission = (responseId: number, rating: string, overall: string, duration: number | string) => ({
    responseId, submittedAt: `2026-10-0${responseId}T18:00:00.000Z`, evaluationScore: null, payoutStatus: 'Pending',
    tester: {
      anonymous: true, username: null, country: 'Slovakia', gender: 'Female', ageRange: '25–34',
      platforms: ['PC / Mac'], gamerType: ['Explorer', 'Completionist'], gamingPreferences: ['Puzzle', 'Co-op'],
      gamingHoursPerWeek: '11–20', hasController: 'Yes', hasMicrophone: 'Yes', testedBefore: 'Yes, informally',
      steam: { connected: true, visibility: 'public', gameCount: 120, totalHours: 2400, syncedAt: '2026-10-01T00:00:00Z',
        match: { ownsGame: false, ownsGameHours: null, genreHours: 40, genreDataPartial: false, modeHours: 300 } },
    },
    answers: [
      { questionId: 102, value: 'Two friends' },
      { questionId: 111, value: duration },
      { questionId: 112, value: rating },
      { questionId: 113, value: 'I did not know where to go after the first bridge.' },
      { questionId: 122, value: 'About right' },
      { questionId: 123, value: '' },
      { questionId: 131, value: overall },
    ],
    files: [
      { questionId: 101, fileName: 'session.mp4', contentType: 'video/mp4', sizeBytes: 1_000_000, url: `https://files.test/${responseId}/session.mp4` },
      { questionId: 101, fileName: 'shot.png', contentType: 'image/png', sizeBytes: 50_000, url: `https://files.test/${responseId}/shot.png` },
    ],
    comments: [{ text: 'Started the session.', createdAt: '2026-10-01T18:00:00.000Z' }],
  });
  return {
    test: { TestID: 32, TestName: 'Synthetic playtest', DueDate: '2026-10-20T00:00:00.000Z', SteamAppID: null, steamMatchGenres: ['Puzzle'], steamMatchModes: ['Co-op'] },
    questions: [
      { QuestionID: 101, QuestionText: 'Upload your recordings here.', DisplayOrder: 1, TypeName: 'File', IsRequired: true, Category: null, Scale: null, Options: null },
      { QuestionID: 102, QuestionText: 'How many people did you play with?', DisplayOrder: 2, TypeName: 'ShortText', IsRequired: true, Category: null, Scale: null, Options: null },
      { QuestionID: 110, QuestionText: 'First contact', DisplayOrder: 3, TypeName: 'SectionHeader', Category: category('A', 'First contact and clarity'), Scale: null },
      { QuestionID: 111, QuestionText: 'Roughly how long did you play in total?', DisplayOrder: 4, TypeName: 'Duration', LibraryKey: 'S22_PLAY_TIME', Category: category('A', 'First contact and clarity'), Scale: null },
      { QuestionID: 112, QuestionText: 'Within the first 10 minutes I understood the goal.', DisplayOrder: 5, TypeName: 'ScaleAgree', LibraryKey: 'S01_CLARITY_10MIN', Category: category('A', 'First contact and clarity'), Scale: agree },
      { QuestionID: 113, QuestionText: 'Describe the first moment you were confused.', DisplayOrder: 6, TypeName: 'LongText', Category: category('A', 'First contact and clarity'), Scale: null },
      { QuestionID: 120, QuestionText: 'Difficulty', DisplayOrder: 7, TypeName: 'SectionHeader', Category: category('D', 'Difficulty'), Scale: null },
      { QuestionID: 122, QuestionText: 'Overall, how difficult was the game?', DisplayOrder: 8, TypeName: 'SingleChoice', Category: category('D', 'Difficulty'), Scale: null, Options: ['Far too easy', 'About right', 'Far too hard'] },
      { QuestionID: 123, QuestionText: 'If not, please explain why.', DisplayOrder: 9, TypeName: 'LongText', Category: category('D', 'Difficulty'), Scale: null },
      { QuestionID: 130, QuestionText: 'Overall experience', DisplayOrder: 10, TypeName: 'SectionHeader', Category: category('I', 'Overall experience'), Scale: null },
      { QuestionID: 131, QuestionText: 'How would you rate your overall experience with the game?', DisplayOrder: 11, TypeName: 'Rating1_10', LibraryKey: 'S21_OVERALL_EXPERIENCE', Category: category('I', 'Overall experience'), Scale: { min: 1, max: 10, labels: null } },
    ],
    responses: [submission(1, '4', '8', 320), submission(2, '2', '5', ''), submission(3, '5', '10', 95)],
    stats: { totalResponses: 3, ratingAverages: { 112: 3.67, 131: 7.67 }, durationAverages: { 111: 207 } },
  };
}
const map = (input: unknown) => mapPortalData(input, '18', '32', portalGenericConfig);
const STANDARD_WARNINGS = 2; // the submission caveat + "no game-specific configuration"

describe('Portal mapping of a production-shaped test', () => {
  it('maps every question type, category, file and answer without warnings', () => {
    const data = map(productionShaped());
    expect(data.questions.map(q => q.type)).toEqual(['file_upload', 'free_text', 'duration', 'rating_1_5', 'free_text', 'multiple_choice', 'free_text', 'rating_1_10']);
    expect(data.categories.map(c => c.name)).toEqual(['First contact and clarity', 'Difficulty', 'Overall experience']);
    expect(data.testers).toHaveLength(3);
    expect(data.testers[0].files).toHaveLength(2);
    expect(data.testers[0].comments).toHaveLength(1);
    expect(data.testers[0].profile?.steam?.match).toEqual({ genreHours: 40, modeHours: 300, partial: false });
    expect(data.responses.filter(r => r.questionId.endsWith('_q_111')).map(r => r.rawAnswer)).toEqual(['320', '', '95']);
    expect(data.responses.find(r => r.questionId.endsWith('_q_131'))).toMatchObject({ numericValue: 8, normalizedScore: 78 });
    expect(data.project).toMatchObject({ name: 'Synthetic playtest', totalResponses: 3, steamMatchGenres: ['Puzzle'], steamMatchModes: ['Co-op'] });
    expect(data.warnings).toHaveLength(STANDARD_WARNINGS);
    expect(JSON.stringify(data)).not.toMatch(/payoutStatus|evaluationScore|syncedAt|ownsGame/);
  });
});

describe('one malformed row never fails the whole report', () => {
  const answersOf = (p: Payload, index = 0) => p.responses[index].answers;
  const cases: [string, (p: Payload) => void, string | null, (data: ReturnType<typeof map>) => void][] = [
    ['a multi-select answer (a list of options)', p => {
      p.questions.push({ QuestionID: 140, QuestionText: 'Which modes did you play?', DisplayOrder: 12, TypeName: 'MultiChoice', Options: ['Solo', 'Co-op'] });
      answersOf(p).push({ questionId: 140, value: ['Solo', 'Co-op'] });
    }, 'Unsupported question type MultiChoice; answers remain unscored.', data => {
      expect(data.responses.find(r => r.questionId.endsWith('_q_140'))?.rawAnswer).toBe('Solo, Co-op');
    }],
    ['an answer value that is an object', p => { answersOf(p)[0].value = { text: 'Two friends' }; },
      'Skipped an answer with an unreadable value.', data => {
        expect(data.responses.filter(r => r.questionId.endsWith('_q_102'))).toHaveLength(2);
      }],
    ['a null answer value (treated as unanswered)', p => { answersOf(p)[0].value = null; }, null, data => {
      expect(data.responses.filter(r => r.questionId.endsWith('_q_102'))).toHaveLength(2);
    }],
    ['a second answer to the same question', p => { answersOf(p).push({ questionId: 112, value: '1' }); },
      'Skipped a duplicate answer.', data => {
        expect(data.responses.filter(r => r.testerId === data.testers[0].id && r.questionId.endsWith('_q_112')).map(r => r.rawAnswer)).toEqual(['4']);
      }],
    ['an answer to a question that does not exist', p => { answersOf(p).push({ questionId: 999, value: 'x' }); },
      'Skipped an answer to an unknown question.', data => { expect(data.responses).toHaveLength(21); }],
    ['an answer without a question ID', p => { answersOf(p).push({ value: 'x' }); },
      'Skipped a malformed answer.', data => { expect(data.responses).toHaveLength(21); }],
    ['a submission whose answer list is not a list', p => { (p.responses[1] as Row).answers = 'oops'; },
      'A submission has a malformed answer list.', data => {
        expect(data.testers).toHaveLength(3);
        expect(data.responses.filter(r => r.testerId === data.testers[1].id)).toHaveLength(0);
      }],
    ['the same submission twice', p => { p.responses.push(structuredClone(p.responses[0])); },
      'Skipped a duplicate submission.', data => { expect(data.testers).toHaveLength(3); }],
    ['a submission without an ID', p => { p.responses[1].responseId = 'abc'; },
      'Skipped a submission without a valid ID.', data => { expect(data.testers.map(t => t.testerId)).toEqual(['Tester-1', 'Tester-3']); }],
    ['a submission that is not an object', p => { p.responses.push(42 as never); },
      'Skipped a malformed submission.', data => { expect(data.testers).toHaveLength(3); }],
    ['an unreadable submission date', p => { p.responses[0].submittedAt = 'yesterday'; },
      'A submission has no valid submission date.', data => {
        expect(data.testers).toHaveLength(3);
        expect(data.responses.find(r => r.testerId === data.testers[0].id)?.submittedAt).toBe('');
      }],
    ['a submission without a tester profile', p => { p.responses[0].tester = null as never; },
      'A submission has no tester profile.', data => {
        expect(data.testers[0].segments).toEqual({});
        expect(data.responses.filter(r => r.testerId === data.testers[0].id)).toHaveLength(7);
      }],
    ['a profile field of the wrong shape', p => { p.responses[0].tester.country = 42; },
      'Ignored a malformed profile field.', data => {
        expect(data.testers[0].country).toBe('');
        expect(data.testers[0].segments.genres).toBe('Puzzle, Co-op');
      }],
    ['a question without text', p => { delete p.questions[1].QuestionText; },
      'Skipped a malformed question.', data => {
        expect(data.questions).toHaveLength(7);
        expect(data.responses.some(r => r.questionId.endsWith('_q_102'))).toBe(false);
      }],
    ['two questions with the same ID', p => { p.questions.push({ ...p.questions[4], DisplayOrder: 20 }); },
      'Skipped a duplicate question.', data => { expect(data.questions).toHaveLength(8); }],
    ['a malformed question category', p => { p.questions[4].Category = 'A'; },
      'Ignored a malformed question category.', data => {
        expect(data.questions.find(q => q.sourceColumn === '112')?.categoryId).toBeNull();
      }],
    ['an out-of-range rating', p => { answersOf(p)[2].value = '9'; },
      'Invalid rating excluded from scores.', data => {
        expect(data.responses.find(r => r.testerId === data.testers[0].id && r.questionId.endsWith('_q_112'))).toMatchObject({ rawAnswer: '9', normalizedScore: null });
      }],
    ['a submission count that disagrees with the stats', p => { p.stats!.totalResponses = 5; },
      'The Portal reports 5 submissions; 3 were loaded.', data => { expect(data.testers).toHaveLength(3); }],
    ['missing stats', p => { delete p.stats; }, null, data => { expect(data.testers).toHaveLength(3); }],
    ['a missing test name', p => { delete p.test.TestName; }, null, data => {
      expect(data.project).toMatchObject({ name: 'Playtest 32', gameName: 'Playtest 32' });
    }],
  ];

  it.each(cases)('%s', (_, mutate, warning, check) => {
    const input = productionShaped();
    mutate(input);
    const data = map(input);
    if (warning) expect(data.warnings).toContain(warning);
    else expect(data.warnings).toHaveLength(STANDARD_WARNINGS);
    check(data);
  });

  it('reports a repeated problem once, with a count', () => {
    const input = productionShaped();
    for (const submission of input.responses) submission.answers.push({ questionId: 999, value: 'x' });
    const warnings = map(input).warnings;
    expect(warnings).toContain('Skipped an answer to an unknown question (3×).');
    expect(warnings).toHaveLength(STANDARD_WARNINGS + 1);
  });
});
