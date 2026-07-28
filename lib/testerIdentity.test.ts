import { describe, expect, it } from 'vitest';
import { formatTesterId, formatTesterLabel, isEmailLike } from './testerIdentity';

describe('tester identity privacy', () => {
  it('detects email-shaped identifiers', () => {
    expect(isEmailLike('person@example.com')).toBe(true);
    expect(isEmailLike('P-123')).toBe(false);
  });

  it('never formats an email as a visible tester id', () => {
    expect(formatTesterId('person@example.com', 'tstr_unmatched_4')).toBe('Unmatched tester 5');
  });

  it('prefers the stable Playlytix registry id', () => {
    expect(formatTesterLabel({ id: 'row', testerId: 'person@example.com', playlytixId: 42 })).toBe('P-42');
  });

  it('preserves safe questionnaire ids', () => {
    expect(formatTesterLabel({ id: 'row', testerId: 'T-007' })).toBe('T-007');
    expect(formatTesterId('19')).toBe('Tester 19');
  });
});
