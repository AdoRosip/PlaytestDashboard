import { describe, it, expect } from 'vitest';
import { resolveGameConfigForTestName, DEFAULT_GAME_ID } from './index';

describe('resolveGameConfigForTestName', () => {
  it('matches a known game name found inside the test name', () => {
    const { config, matchedBy } = resolveGameConfigForTestName('Exovia — Alpha Wave 3');
    expect(config.id).toBe('exovia');
    expect(matchedBy).toBe('name-match');
  });

  it('is case-insensitive', () => {
    const { config } = resolveGameConfigForTestName('wannabe trashman closed beta');
    expect(config.id).toBe('wannabe-trashman');
  });

  it('falls back to the default game when the name matches nothing', () => {
    const { config, matchedBy } = resolveGameConfigForTestName('API Demo — Sample Playtest');
    expect(config.id).toBe(DEFAULT_GAME_ID);
    expect(matchedBy).toBe('default');
  });

  it('falls back to the default game when the name is missing', () => {
    const { matchedBy } = resolveGameConfigForTestName(null);
    expect(matchedBy).toBe('default');
  });

  it('an explicit override always wins, even over a matching name', () => {
    const { config, matchedBy } = resolveGameConfigForTestName('Exovia — Alpha Wave 3', 'wannabe-trashman');
    expect(config.id).toBe('wannabe-trashman');
    expect(matchedBy).toBe('explicit');
  });

  it('ignores an unknown explicit override id and falls through to name matching', () => {
    const { config, matchedBy } = resolveGameConfigForTestName('Exovia — Alpha Wave 3', 'not-a-real-game');
    expect(config.id).toBe('exovia');
    expect(matchedBy).toBe('name-match');
  });
});
