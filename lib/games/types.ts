import type { Category } from '../types';

/**
 * A single headline KPI on the overview page, matched to a question by regex.
 * `scaleMax` is the displayed denominator (e.g. "4.1 / 5") and is used as a
 * fallback when the detected question has no `scaleMax` of its own.
 */
export interface KpiDefinition {
  key: string;
  label: string;
  pattern: RegExp;
  scaleMax: number;
}

/**
 * Regexes the dashboard uses to locate the special "background" questions that
 * power filters. All optional — a game without a session-playtime question just
 * omits that filter. `priorGames` powers the "played X before" toggles; each
 * entry's question must live in the background category (`backgroundCategoryId`).
 */
export interface FilterDetectors {
  /** "How long did you play this session?" — numeric answer. */
  sessionPlaytime?: RegExp;
  /** The single "how much did you enjoy it overall?" question (sentiment bands). */
  enjoyOverall?: RegExp;
  /** Prior-experience toggles, e.g. Factorio / Satisfactory. */
  priorGames?: { key: string; label: string; pattern: RegExp }[];
  /** Category id the prior-game questions must belong to (background segment). */
  backgroundCategoryId?: string;
}

/**
 * Everything that is specific to one game's playtest form. The parser and the
 * dashboard read from the active config instead of hardcoding one game.
 *
 * `overviewMode` decides the overview layout emphasis:
 *   - 'scoring'     → rating-heavy forms (Exovia): category scorecards lead.
 *   - 'qualitative' → free-text-heavy forms (Wannabe Trashman): AI themes + a
 *                     couple of KPIs lead; scorecards are de-emphasised.
 */
export interface GameConfig {
  id: string;
  gameName: string;
  /** Fixed category list. Categories are never read from the Excel file. */
  categories: Category[];
  /** [categoryId, regex] rules; first match wins. Maps question text → category. */
  categoryRules: [string, RegExp][];
  /** Negatively-valenced rating questions (high answer = worse experience). */
  inverseScoringPatterns: RegExp[];
  /** Overview headline KPI questions. */
  kpis: KpiDefinition[];
  /** Regexes for filter-driving background questions. */
  filters: FilterDetectors;
  /**
   * Genres that define this game's target player. A tester who actually plays
   * these genres (from the "Type of Gamer" registry data) is a more credible
   * voice for this game — the "genre fit" signal. `match` is tested against the
   * tester's comma-joined genres string (which carries parenthetical suffixes,
   * so keep patterns to core keywords).
   */
  targetGenres?: { label: string; match: RegExp }[];
  overviewMode: 'scoring' | 'qualitative';
}
