import { describe, expect, it } from 'vitest';
import { mapPortalData } from './playlytix/mapper';
import { portalGenericConfig } from './games/portalGeneric';
import { dossierFixture } from '../tests/fixtures/tester-dossier';
import { filterTesterList, profileAnswers, profileGenreFit, profileText, ratingAverages } from './dossier';

const mapped = () => mapPortalData(dossierFixture(), '7', '18', portalGenericConfig);
describe('dossier data contract', () => {
  it('maps every supplied rating type, API categories, order and target genres', () => {
    const data = mapped();
    expect(data.questions.slice(0, 6).map(q => q.type)).toEqual(['rating_1_5', 'rating_1_5', 'rating_1_5', 'rating_1_10', 'multiple_choice', 'free_text']);
    expect(data.responses[3]).toMatchObject({ numericValue: 1, normalizedScore: 0 });
    expect(data.questions[3]).toMatchObject({ displayOrder: 7, scaleMax: 10 });
    expect(data.categories[0].name).toBe('Controls and interface');
    expect(data.project.steamMatchGenres).toEqual(['Puzzle']);
    expect(profileGenreFit(data.testers[1], portalGenericConfig, data.project.steamMatchGenres).value).toBe('Target genre');
  });
  it('preserves videos while excluding screenshots, operator fields and anonymous names', () => {
    const data = mapped();
    expect(data.testers[0].files).toHaveLength(1);
    expect(data.testers[0].files![0]).toMatchObject({ name: 'attachment-1.mp4', mimeType: 'video/mp4', questionId: 'portal_7_18_q_955' });
    expect(JSON.stringify(data)).not.toMatch(/hidden-user|evaluationScore|payoutStatus|syncedAt|subscriptions/);
    expect(profileText('Email me at someone@example.com')).not.toContain('@');
  });
  it('computes question averages only from the supplied cohort and scales ten-point ratings', () => {
    const { responses, questions } = mapped();
    const all = ratingAverages(responses, questions);
    const filtered = ratingAverages(responses.filter(r => r.testerId?.endsWith('_28')), questions);
    expect(all.questions.get(questions[0].id)).toBe(3);
    expect(filtered.questions.get(questions[0].id)).toBe(1);
    expect(filtered.overall).toBe(1);
    expect(ratingAverages([], questions).overall).toBeUndefined();
  });
  it('preserves registry tri-state and skips blank/internal answers', () => {
    const { testers, responses, questions } = mapped();
    expect(profileGenreFit({ ...testers[0], inRegistry: undefined }, portalGenericConfig)).toEqual({ value: '—', reason: 'profile data unavailable' });
    expect(profileGenreFit(testers[0], portalGenericConfig, []).value).toBe('Not set');
    const result = profileAnswers(testers[0].id, [...responses, { ...responses[0], id: 'empty', rawAnswer: '' }], questions);
    expect(result).toHaveLength(26);
    expect(result[0].index).toBe(4);
  });
  it('uses the same name, quality and genre filters for navigation and the list', () => {
    const d = mapped();
    expect(filterTesterList(d.testers, '29', 'all', d.responses, d.questions, portalGenericConfig).map(t => t.id)).toEqual([d.testers[1].id]);
    expect(filterTesterList(d.testers, '', 'target_genre', d.responses, d.questions, portalGenericConfig, ['Puzzle']).map(t => t.id)).toEqual([d.testers[1].id]);
  });
});
