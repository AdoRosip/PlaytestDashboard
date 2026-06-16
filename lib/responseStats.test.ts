import { describe, it, expect } from 'vitest';
import type { Response } from './types';
import { getRespondentIds, countRespondents } from './responseStats';

function response(testerId: string | null): Response {
  return {
    id: `${testerId}_${Math.random()}`,
    projectId: 'p',
    testerId,
    questionId: 'q',
    rawAnswer: '',
    numericValue: null,
    normalizedScore: null,
    submittedAt: '',
    matchStatus: 'matched',
  };
}

describe('getRespondentIds / countRespondents', () => {
  it('counts distinct testers, ignoring null tester ids', () => {
    const responses = [response('a'), response('a'), response('b'), response(null)];
    expect(getRespondentIds(responses)).toEqual(new Set(['a', 'b']));
    expect(countRespondents(responses)).toBe(2);
  });

  it('returns 0 for an empty list', () => {
    expect(countRespondents([])).toBe(0);
  });

  it('returns 0 when every response is unattributed', () => {
    expect(countRespondents([response(null), response(null)])).toBe(0);
  });
});
