import type { GameConfig } from './types';
import { exoviaConfig } from './exovia';
import { wannabeTrashmanConfig } from './wannabeTrashman';

export type { GameConfig, KpiDefinition, FilterDetectors } from './types';
export { exoviaConfig } from './exovia';
export { wannabeTrashmanConfig } from './wannabeTrashman';

/** All known games, keyed by config id. */
export const GAME_CONFIGS: Record<string, GameConfig> = {
  [exoviaConfig.id]: exoviaConfig,
  [wannabeTrashmanConfig.id]: wannabeTrashmanConfig,
};

/** Ordered list for pickers. */
export const GAME_LIST: GameConfig[] = [wannabeTrashmanConfig, exoviaConfig];

/** The game used when none is specified (current active playtest). */
export const DEFAULT_GAME_ID = wannabeTrashmanConfig.id;

export function getGameConfig(id: string | undefined | null): GameConfig {
  return (id && GAME_CONFIGS[id]) || GAME_CONFIGS[DEFAULT_GAME_ID];
}

/** Resolve the active game config from a project's gameName (set at parse time). */
export function getGameConfigByName(gameName: string | undefined | null): GameConfig {
  const found = GAME_LIST.find((g) => g.gameName === gameName);
  return found ?? GAME_CONFIGS[DEFAULT_GAME_ID];
}

/** How resolveGameConfigForTestName arrived at its answer — surfaced in the UI so a wrong guess is visible. */
export type GameMatchSource = 'explicit' | 'name-match' | 'default';

/**
 * Playlytix portal tests carry only a free-text `TestName` (e.g. "Wannabe
 * Trashman — Alpha Wave 3"), not a game id — the API has no game concept.
 * We guess by checking whether the test name mentions a known game, and fall
 * back to the default game otherwise. Always call with `explicitGameId` first
 * (a `?game=` override) so a bad guess can be corrected without a code change.
 */
export function resolveGameConfigForTestName(
  testName: string | undefined | null,
  explicitGameId?: string | null,
): { config: GameConfig; matchedBy: GameMatchSource } {
  if (explicitGameId && GAME_CONFIGS[explicitGameId]) {
    return { config: GAME_CONFIGS[explicitGameId], matchedBy: 'explicit' };
  }
  const name = (testName ?? '').toLowerCase();
  if (name) {
    const found = GAME_LIST.find((g) => name.includes(g.gameName.toLowerCase()));
    if (found) return { config: found, matchedBy: 'name-match' };
  }
  return { config: GAME_CONFIGS[DEFAULT_GAME_ID], matchedBy: 'default' };
}

/** First category rule whose regex matches the question text wins (or null). */
export function categoryForQuestion(config: GameConfig, questionText: string): string | null {
  for (const [catId, pattern] of config.categoryRules) {
    if (pattern.test(questionText)) return catId;
  }
  return null;
}
