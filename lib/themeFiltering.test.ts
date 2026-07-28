import { describe, expect, it } from 'vitest';
import type { Response, Theme } from './types';
import { filterThemesForResponses } from './themeFiltering';

const response = (id: string): Response => ({
  id,
  projectId: 'p',
  testerId: 't',
  questionId: 'q',
  rawAnswer: 'answer',
  numericValue: null,
  normalizedScore: null,
  submittedAt: '',
  matchStatus: 'matched',
});

const theme = (linkedResponseIds: string[]): Theme => ({
  id: 'theme',
  projectId: 'p',
  categoryId: null,
  questionId: null,
  label: 'Theme',
  summary: 'Summary',
  frequency: linkedResponseIds.length,
  severity: 'High',
  confidence: 0.9,
  representativeQuotes: ['quote from an excluded tester'],
  linkedResponseIds,
});

describe('filterThemesForResponses', () => {
  it('returns stored themes unchanged when no demographic filter is active', () => {
    const themes = [theme(['r1', 'r2'])];
    expect(filterThemesForResponses(themes, [response('r1')], false)).toBe(themes);
  });

  it('removes excluded evidence, quotes, and empty themes for a filtered cohort', () => {
    const result = filterThemesForResponses(
      [theme(['r1', 'r2']), { ...theme(['r3']), id: 'excluded' }],
      [response('r1')],
      true,
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.linkedResponseIds).toEqual(['r1']);
    expect(result[0]?.frequency).toBe(1);
    expect(result[0]?.representativeQuotes).toEqual([]);
  });
});
