import { describe, expect, it } from 'vitest';
import { formatTesterId, formatTesterLabel, getTesterDisplayName, isEmailLike } from './testerIdentity';

describe('tester identity privacy', () => {
  it('only displays a username with explicit permission and rejects contact identifiers', () => {
    const tester = { id: 'row', testerId: 'Tester-29', username: 'player' };
    expect(getTesterDisplayName(tester)).toBe('Tester-29');
    expect(getTesterDisplayName({ ...tester, anonymous: true })).toBe('Tester-29');
    expect(getTesterDisplayName({ ...tester, anonymous: false })).toBe('player');
    expect(getTesterDisplayName({ ...tester, anonymous: false, username: 'player@example.test' })).toBe('Tester-29');
  });
  it('detects email-shaped identifiers', () => {
    expect(isEmailLike('person@example.com')).toBe(true);
    expect(isEmailLike('P-123')).toBe(false);
  });

  it('never formats an email as a visible tester id', () => {
    expect(formatTesterId('person@example.com', 'tstr_unmatched_4')).toBe('Unmatched tester 5');
  });

  it('prefers the stable Playlytix registry id', () => {
    expect(formatTesterLabel({ id: 'row', testerId: 'person@example.com', playlytixId: 42 })).toBe('Tester-42');
  });

  it('preserves safe questionnaire ids', () => {
    expect(formatTesterLabel({ id: 'row', testerId: 'T-007' })).toBe('T-007');
    expect(formatTesterId('19')).toBe('Tester 19');
  });
});
