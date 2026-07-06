import type { Category } from '../types';
import type { GameConfig } from './types';

// ---------------------------------------------------------------------------
// Wannabe Trashman — a trash-collecting game. Free-text-heavy form: only two
// real player ratings (core-loop fun, wishlist likelihood), so categories act
// as thematic groupings for AI synthesis rather than scored buckets.
// Category ids are kept generic ('wt_*') and distinct from Exovia's 'cat_*'.
// ---------------------------------------------------------------------------

const categories: Category[] = [
  { id: 'wt_overall',     projectId: 'proj_import', name: 'Overall Experience',        description: 'Core-loop fun, most enjoyable parts, repetition, and overall impression', order: 1, color: '#00FFFF' },
  { id: 'wt_onboarding',  projectId: 'proj_import', name: 'Tutorial & Clarity',        description: 'Was the tutorial clear and did players understand what to do', order: 2, color: '#0066FF' },
  { id: 'wt_core',        projectId: 'proj_import', name: 'Core Mechanics & Minigames',description: 'Lockpicking minigame and random events (Lost Briefcase, Garbage Truck)', order: 3, color: '#6366F1' },
  { id: 'wt_progression', projectId: 'proj_import', name: 'Progression & Upgrades',    description: 'How upgrades feel and the sense of progress', order: 4, color: '#0000EE' },
  { id: 'wt_retention',   projectId: 'proj_import', name: 'Retention & Market Fit',    description: 'Full-release potential, wishlist intent, and what keeps players playing', order: 5, color: '#0EA5E9' },
  { id: 'wt_features',    projectId: 'proj_import', name: 'Feature Requests',          description: 'Requested mechanics, loot categories/tiers, and multiplayer/co-op', order: 6, color: '#8B5CF6' },
  { id: 'wt_technical',   projectId: 'proj_import', name: 'Technical & Evidence',      description: 'Bugs, soft-locks, glitches, and gameplay footage', order: 7, color: '#F59E0B' },
  { id: 'wt_admin',       projectId: 'proj_import', name: 'Admin / Internal',          description: 'Internal evaluation score and admin notes — excluded from report', order: 8, color: '#334155' },
];

const categoryRules: [string, RegExp][] = [
  // Admin / Internal — evaluation score, admin notes, the stray "Column NN" dup.
  ['wt_admin',       /evaluation.?score|admin.?note|^column\s*\d+$|__empty/i],
  // Technical & Evidence — bugs and footage links.
  ['wt_technical',   /bug|soft.?lock|glitch|upload.*footage|media.?footage|gameplay footage/i],
  // Tutorial & Clarity.
  ['wt_onboarding',  /tutorial|immediately understand|figure out|need(?:ed)? to do/i],
  // Core Mechanics & Minigames — lockpicking + random events.
  ['wt_core',        /lockpick|minigame|random event|lost briefcase|garbage truck/i],
  // Feature Requests — new mechanics, trash tiers, loot ideas, multiplayer.
  ['wt_features',    /other mechanics.*add|different tiers|categories of trash|loot categor|multiplayer|co-?op/i],
  // Retention & Market Fit — potential, wishlist, change-your-mind, keep playing.
  ['wt_retention',   /full-?release|potential to be a fun|wishlist|change your mind|keep playing.*after|motivate you to keep/i],
  // Progression & Upgrades.
  ['wt_progression', /upgrades? feel|how did the upgrades/i],
  // Overall Experience — core loop fun, enjoyable parts, repetition, overall.
  ['wt_overall',     /core gameplay loop|repetitive or boring|most enjoyable|overall experience/i],
];

export const wannabeTrashmanConfig: GameConfig = {
  id: 'wannabe-trashman',
  gameName: 'Wannabe Trashman',
  categories,
  categoryRules,
  // No negatively-valenced rating questions — the two ratings are both positive.
  inverseScoringPatterns: [],
  kpis: [
    { key: 'core_loop', label: 'Core Loop Fun',      pattern: /core gameplay loop|how fun was the core/i, scaleMax: 5 },
    { key: 'wishlist',  label: 'Wishlist Likelihood', pattern: /wishlist/i,                                scaleMax: 5 },
  ],
  filters: {
    // No dedicated session-playtime or prior-game questions in this form.
    // Use core-loop fun as the sentiment-band driver (closest 1–5 signal).
    enjoyOverall: /core gameplay loop|how fun was the core/i,
  },
  // Open-world, first-person hustle sim: collect trash → sell → upgrade.
  targetGenres: [
    { label: 'Simulation / Cozy',    match: /simulation|cozy/i },
    { label: 'Sandbox / Open-World', match: /sandbox|open.?world/i },
    { label: 'Survival / Crafting',  match: /survival|crafting/i },
  ],
  overviewMode: 'qualitative',
};
