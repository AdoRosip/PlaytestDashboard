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
  it('rejects inconsistent scale metadata and invalid ordering even for a single question', () => {
    const input = structuredClone(productionResponse);
    input.questions[0].Scale.max = 10;
    expect(() => mapPortalData(input, '7', '18', portalGenericConfig)).toThrow('Rating scale');
    input.questions[0].Scale.max = 5;
    input.questions[0].DisplayOrder = NaN;
    expect(() => mapPortalData(input, '7', '18', portalGenericConfig)).toThrow('question order');
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
    expect(() => mapPortalData(input, '18', '32', portalGenericConfig)).toThrow();
  });
  it('leaves unknown types and invalid ratings unscored', () => {
    const input = fixture(); input.questions[0].TypeName = 'NewType';
    expect(mapPortalData(input, '18', '32', portalGenericConfig).questions[0].type).toBe('unknown');
    input.questions[0].TypeName = 'Rating1_5'; input.responses[0].answers[0].value = '6';
    expect(mapPortalData(input, '18', '32', portalGenericConfig).responses[0].normalizedScore).toBeNull();
  });
  it('rejects mismatched tests, duplicate IDs, unknown references and incomplete data', () => {
    expect(() => mapPortalData(fixture(), '18', '33', portalGenericConfig)).toThrow();
    const duplicate = fixture(); duplicate.responses.push(duplicate.responses[0]);
    expect(() => mapPortalData(duplicate, '18', '32', portalGenericConfig)).toThrow();
    const unknown = fixture(); unknown.responses[0].answers[0].questionId = 999;
    expect(() => mapPortalData(unknown, '18', '32', portalGenericConfig)).toThrow();
    const incomplete = fixture(); incomplete.stats.totalResponses = 2;
    expect(() => mapPortalData(incomplete, '18', '32', portalGenericConfig)).toThrow();
  });
});
