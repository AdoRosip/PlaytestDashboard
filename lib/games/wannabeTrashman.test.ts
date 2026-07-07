import { describe, it, expect } from 'vitest';
import { wannabeTrashmanConfig } from './wannabeTrashman';
import { categoryForQuestion } from './index';

// Real column headers from the Wannabe Trashman feedback export → expected category.
const CASES: [string, string][] = [
  ['On a scale of 1 to 5, how fun was the core gameplay loop?', 'wt_overall'],
  ['Was the tutorial clear? Did you immediately understand what you needed to do, or did it take some time to figure out?', 'wt_onboarding'],
  ['Do you think this concept has the potential to be a fun, full-release game?', 'wt_retention'],
  ['At any point, did the game feel repetitive or boring?', 'wt_overall'],
  ['How likely are you to wishlist this game in its current state?', 'wt_retention'],
  ['If you answered 3 or lower above, is there something specific that would change your mind?', 'wt_retention'],
  ['What parts of the game were the most enjoyable for you?', 'wt_overall'],
  ['What other mechanics would you like to be added to the game?', 'wt_features'],
  ['Would you like to see different tiers or categories of trash to collect (e.g., Metal scrap, Cloth, Cigarettes, Cups)', 'wt_features'],
  ['How did the upgrades feel?', 'wt_progression'],
  ['What did you think of the lockpicking minigame?', 'wt_core'],
  ['Did the random events (Lost Briefcase, Garbage Truck) feel rewarding and happen at a good pace?', 'wt_core'],
  ['What are some aspects that would motivate you to keep playing the game after 1-2 hours?', 'wt_retention'],
  ['Would adding a multiplayer/co-op option be a deciding factor for you to buy the game?', 'wt_features'],
  ['Did you encounter any bugs, soft-locks, or visual glitches?', 'wt_technical'],
  ['Overall Experience', 'wt_overall'],
  ['Evaluation Score (1 WORST - 5 BEST)', 'wt_admin'],
  ['Admin Notes', 'wt_admin'],
  ['Column 25', 'wt_admin'],
];

describe('wannabeTrashman category assignment', () => {
  it.each(CASES)('maps %j → %s', (text, expected) => {
    expect(categoryForQuestion(wannabeTrashmanConfig, text)).toBe(expected);
  });

  it('every rule targets a real category', () => {
    const ids = new Set(wannabeTrashmanConfig.categories.map((c) => c.id));
    for (const [catId] of wannabeTrashmanConfig.categoryRules) {
      expect(ids.has(catId)).toBe(true);
    }
  });

  it('is a qualitative-mode game with two KPIs', () => {
    expect(wannabeTrashmanConfig.overviewMode).toBe('qualitative');
    expect(wannabeTrashmanConfig.kpis).toHaveLength(2);
  });
});
