import { describe, expect, it } from 'vitest';
import type { Tester } from './types';
import { portalGenericConfig } from './games/portalGeneric';
import { geoSummary, groupSummary, playerInsights } from './testerInsights';

const tester = (id: number, segments: Tester['segments'], profile?: Tester['profile']): Tester => ({
  id: `t${id}`, testerId: `Tester-${id}`, email: '', discord: '', segments, profile, inRegistry: true,
  ageGroup: segments.age_group ?? '', country: segments.country ?? '', gamingProfile: '', hardware: '',
  similarGamesPlayed: [], rawProfileJson: {},
});

const testers = [
  tester(1, { gender: 'Male', age_group: '25-34', has_mic: 'Yes', genres: 'Puzzle, Strategy', country: 'Germany' }, { steam: { totalHours: 820 }, languages: ['English', 'German'] }),
  tester(2, { gender: 'Male', age_group: '18-24', has_mic: 'Yes', genres: 'Puzzle', country: 'Germany' }, { steam: { totalHours: 20 }, languages: ['English'] }),
  tester(3, { gender: 'Female', age_group: '25-34', has_mic: 'No', genres: 'Strategy', country: 'USA' }, { steam: { totalHours: 600 } }),
  tester(4, { gender: 'Male', age_group: '35+', country: '' }),
];

describe('tester insights', () => {
  it('rolls up countries, continents and languages', () => {
    const geo = geoSummary(testers);
    expect(geo.countries).toEqual([{ label: 'Germany', count: 2, pct: 50 }, { label: 'USA', count: 1, pct: 25 }]);
    expect(geo.continentCount).toBe(2);
    expect(geo.continents.map(r => r.label)).toContain('Unknown');
    expect(geo.languages[0]).toEqual({ label: 'English', count: 2, pct: 100 });
  });

  it('picks a chart per attribute and uses the right base', () => {
    const { groups, steamLinked } = playerInsights(testers, portalGenericConfig, ['Puzzle']);
    const attrs = new Map(groups.flatMap(g => g.attributes).map(a => [a.key, a]));
    expect(attrs.get('age')).toMatchObject({ ordered: true, base: 4, source: 'Single choice · 4 testers' });
    expect(attrs.get('age')!.rows.map(r => r.label)).toEqual(['18-24', '25-34', '35+']);
    expect(attrs.get('gender')).toMatchObject({ ordered: false, headline: { pct: 75, text: 'male' } });
    expect(attrs.get('mic')).toMatchObject({ headline: { pct: 67, text: 'have a mic' }, source: 'Single choice · 3 of 4 testers' });
    expect(attrs.get('genres')).toMatchObject({ headline: { pct: 67, text: 'play Puzzle' }, source: 'Multi-select · 3 of 4 testers' });
    expect(attrs.get('steam')).toMatchObject({ base: 3, headline: { pct: 67, text: '50h+ on Steam' }, source: 'From 3 linked Steam libraries' });
    expect(attrs.get('steam')!.rows.map(r => r.label)).toEqual(['<50h', '50–200h', '200–500h', '500–1,000h', '1,000h+']);
    expect(steamLinked).toBe(3);
    expect(groups.map(g => g.key)).toEqual(['profile', 'genres', 'playstyle']);
  });

  it('rolls answers past the sixth into one "Other" column, counting each tester once', () => {
    const many = [
      tester(1, { genres: 'A, B' }), tester(2, { genres: 'A, C' }), tester(3, { genres: 'A, D' }),
      tester(4, { genres: 'B, E' }), tester(5, { genres: 'F, G' }), tester(6, { genres: 'G, H' }),
    ];
    const genres = playerInsights(many, portalGenericConfig).groups[0].attributes.find(a => a.key === 'genres')!;
    expect(genres.rows.map(r => r.label)).toEqual(['A', 'B', 'G', 'C', 'D', 'Other']);
    expect(genres.rows[5]).toEqual({ label: 'Other', count: 3, pct: 50 });
  });

  it('builds the typical tester and plain-language summaries', () => {
    const { traits, groups } = playerInsights(testers, portalGenericConfig, ['Puzzle']);
    expect(traits.map(t => [t.label, t.value])).toEqual([
      ['Age', '25-34'], ['Gender', 'Male'], ['Country', 'Germany'], ['Top genre', 'Puzzle'],
    ]);
    expect(traits[2]).toMatchObject({ count: 2, base: 3, pct: 67 });
    expect(groupSummary(groups[0].attributes)).toBe('Half are aged 25-34, most are male, and most have a mic.');
  });

  it('skips attributes nobody answered', () => {
    const { groups } = playerInsights([tester(9, {})], portalGenericConfig);
    expect(groups).toEqual([]);
  });
});
