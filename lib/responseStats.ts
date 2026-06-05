import type { Response } from './types';

export function getRespondentIds(responses: Response[]): Set<string> {
  return new Set(responses.flatMap((r) => r.testerId ? [r.testerId] : []));
}

export function countRespondents(responses: Response[]): number {
  return getRespondentIds(responses).size;
}
