import { describe, expect, it } from 'vitest';
import { mapPortalData } from './playlytix/mapper';
import { portalGenericConfig } from './games/portalGeneric';
import { dossierFixture } from '../tests/fixtures/tester-dossier';
import { filterTesterList, profileAnswers, profileGenreFit, profileText, ratingAverages, screenshotGroups, videoFiles } from './dossier';

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
  it('preserves videos and screenshots while excluding operator fields and anonymous names', () => {
    const data = mapped();
    expect(data.testers[0].files).toHaveLength(2);
    expect(data.testers[0].files![0]).toMatchObject({ name: 'attachment-1.mp4', mimeType: 'video/mp4', questionId: 'portal_7_18_q_955' });
    expect(data.testers[0].files![1]).toMatchObject({ name: 'screenshot.jpg', mimeType: 'image/jpeg', questionId: 'portal_7_18_q_955' });
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
  it('judges genre fit by Steam hours in the target genres when the Portal sends them', () => {
    const input = dossierFixture();
    input.responses[0].tester.steam = { ...input.responses[0].tester.steam, match: { ownsGame: false, ownsGameHours: null, genreHours: 52, genreDataPartial: false, modeHours: 1466 } } as never;
    input.responses[1].tester.steam = { ...input.responses[1].tester.steam, match: { ownsGame: false, ownsGameHours: null, genreHours: 0, genreDataPartial: true, modeHours: 3 } } as never;
    const { testers, project } = mapPortalData(input, '7', '18', portalGenericConfig);
    expect(testers[0].profile!.steam!.match).toEqual({ genreHours: 52, modeHours: 1466, partial: false });
    // Tester 0 never listed Puzzle as a liked genre, but has Puzzle hours on Steam.
    expect(profileGenreFit(testers[0], portalGenericConfig, project.steamMatchGenres)).toEqual({ value: 'Target genre', hours: 52, reason: 'Puzzle on Steam' });
    expect(profileGenreFit(testers[1], portalGenericConfig, project.steamMatchGenres)).toEqual({ value: 'Outside target', hours: 0, reason: 'Puzzle on Steam · partial data' });
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
  it('groups screenshots by question in questionnaire order, apart from videos', () => {
    const { testers, questions } = mapped();
    const files = [...testers[0].files!, { id: 'late', name: 'b.png', questionId: questions[0].id }, { id: 'orphan', name: 'c.webp' }];
    const groups = screenshotGroups(files, questions);
    expect(groups.map(g => [g.q?.id, g.index, g.files.map(f => f.name)])).toEqual([
      [questions[0].id, 4, ['b.png']], ['portal_7_18_q_955', 9, ['screenshot.jpg']], [undefined, Infinity, ['c.webp']],
    ]);
    expect(videoFiles(files).map(f => f.name)).toEqual(['attachment-1.mp4']);
  });
  it('combines comma-separated roster filters and searches by country', () => {
    const d = mapped();
    d.testers[0].files = [];
    d.testers[1].segments.country = 'Narnia';
    const ids = (search: string, filter: string) =>
      filterTesterList(d.testers, search, filter, d.responses, d.questions, portalGenericConfig, ['Puzzle']).map(t => t.id);
    expect(ids('', 'recording')).toEqual([d.testers[1].id]);
    expect(ids('', 'target_genre,recording')).toEqual([d.testers[1].id]);
    expect(ids('', 'unmatched,recording')).toEqual([]);
    expect(ids('narn', 'all')).toEqual([d.testers[1].id]);
  });
});
