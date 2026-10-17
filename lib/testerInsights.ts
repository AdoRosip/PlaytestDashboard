import type { Tester } from './types';
import type { GameConfig } from './games';
import { splitMulti } from './testerProfile';
import { CORE_AUDIENCE_HOURS, profileGenreFit } from './dossier';
import { continentFor } from './geo';

// ─────────────────────────────────────────────────────────────────────────────
// Read models for the Testers page: geography roll-ups, per-attribute answer
// distributions (Players tab) and the "typical tester" traits. Pure — every
// figure is computed from the already-filtered tester list it is given.
// ─────────────────────────────────────────────────────────────────────────────

export interface Row { label: string; count: number; pct: number }

const pctOf = (count: number, base: number) => (base > 0 ? Math.round((count / base) * 100) : 0);

/** Count each label and express it as a share of `base`, largest first. */
export function countRows(values: string[], base: number): Row[] {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts]
    .map(([label, count]) => ({ label, count, pct: pctOf(count, base) }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

const isUnknown = (value: string) => !value || /^(unknown|n\/?a|none|-+)$/i.test(value);

export const testerCountry = (t: Tester) => (t.segments.country || t.country || '').trim();

// ── Geography ────────────────────────────────────────────────────────────────

export interface GeoSummary {
  countries: Row[];
  continents: Row[];
  /** Continents with at least one tester, excluding "Unknown". */
  continentCount: number;
  languages: Row[];
}

export function geoSummary(testers: Tester[]): GeoSummary {
  const total = testers.length;
  const countries = countRows(testers.map(testerCountry).filter(c => !isUnknown(c)), total);
  const continents = countRows(testers.map(t => continentFor(testerCountry(t))), total);
  const withLanguages = testers.filter(t => t.profile?.languages?.length);
  const languages = countRows(withLanguages.flatMap(t => [...new Set(t.profile!.languages)]), withLanguages.length);
  return {
    countries,
    continents,
    continentCount: continents.filter(r => r.label !== 'Unknown').length,
    languages,
  };
}

// ── Steam ────────────────────────────────────────────────────────────────────

export const steamHours = (t: Tester) => t.profile?.steam?.totalHours;
export const isSteamLinked = (t: Tester) => !!t.profile?.steam;

// ── Player attributes ────────────────────────────────────────────────────────

export type GroupKey = 'profile' | 'genres' | 'playstyle';

export const GROUP_LABELS: Record<GroupKey, string> = {
  profile: 'Profile',
  genres: 'Genres',
  playstyle: 'Playstyle',
};

export interface Attribute {
  key: string;
  label: string;
  group: GroupKey;
  /** Range answers (age, hours, Steam hours) whose rows keep their scale order. */
  ordered: boolean;
  /** Column-chart rows: scale order when `ordered`, otherwise largest first with the tail rolled into "Other". */
  rows: Row[];
  /** Most common answer, before any "Other" roll-up. */
  top: Row;
  /** Testers the percentages are taken over. */
  base: number;
  source: string;
  headline: { pct: number; text: string };
  /** Verb phrase for the section summary, e.g. "are male", "have a mic". */
  clause: string;
}

interface YesNo {
  isYes: (label: string) => boolean;
  sub: string;
}

interface Def {
  key: string;
  label: string;
  group: GroupKey;
  multi?: boolean;
  ordered?: boolean;
  values: (t: Tester) => string[];
  sub: (top: string) => string;
  clause?: (top: string) => string;
  yesNo?: YesNo;
}

const YES = /^(yes|y|true)\b/i;
const one = (value: string | undefined) => (value && !isUnknown(value.trim()) ? [value.trim()] : []);
const many = (value: string | string[] | undefined) =>
  [...new Set((Array.isArray(value) ? value : splitMulti(value)).filter(v => !isUnknown(v)))];
const hoursText = (label: string) => (/[a-z]/i.test(label) ? label : `${label} h`);

function definitions(config: GameConfig, targets?: string[]): Def[] {
  const hasTargets = (targets ?? config.targetGenres?.map(g => g.label) ?? []).length > 0;
  return [
    // Profile
    { key: 'age', label: 'Age', group: 'profile', ordered: true,
      values: t => one(t.segments.age_group || t.ageGroup),
      sub: v => `aged ${v}`, clause: v => `are aged ${v}` },
    { key: 'gender', label: 'Gender', group: 'profile',
      values: t => one(t.segments.gender),
      sub: v => v.toLowerCase(), clause: v => `are ${v.toLowerCase()}` },
    { key: 'platform', label: 'Platform', group: 'profile', multi: true,
      values: t => many(t.segments.platform),
      sub: v => `play on ${v}` },
    { key: 'hardware', label: 'Hardware tier', group: 'profile',
      values: t => one(t.segments.hardware_tier),
      sub: v => `${v} setup`, clause: v => `have a ${v} setup` },
    { key: 'controller', label: 'Controller', group: 'profile',
      values: t => one(t.segments.has_controller),
      sub: v => v, yesNo: { isYes: v => YES.test(v), sub: 'have a controller' } },
    { key: 'mic', label: 'Microphone', group: 'profile',
      values: t => one(t.segments.has_mic),
      sub: v => v, yesNo: { isYes: v => YES.test(v), sub: 'have a mic' } },
    // Genres
    { key: 'genres', label: 'Genres played', group: 'genres', multi: true,
      values: t => many(t.segments.genres),
      sub: v => `play ${v}` },
    ...(hasTargets ? [{ key: 'targetFit', label: 'Target genre', group: 'genres' as const,
      values: (t: Tester) => {
        const fit = profileGenreFit(t, config, targets).value;
        return fit === 'Target genre' ? ['Target genre'] : fit === 'Outside target' ? ['Outside target'] : [];
      },
      sub: (v: string) => v,
      yesNo: { isYes: (v: string) => v === 'Target genre', sub: 'play a target genre' } }] : []),
    { key: 'avoided', label: 'Avoided genres', group: 'genres', multi: true,
      values: t => many(t.profile?.avoidedGenres),
      sub: v => `avoid ${v}` },
    // Playstyle
    { key: 'playstyles', label: 'Playstyle', group: 'playstyle', multi: true,
      values: t => many(t.segments.playstyles),
      sub: v => v, clause: v => `identify as ${v}` },
    { key: 'gamerType', label: 'Gamer type', group: 'playstyle', multi: true,
      // Portal data mirrors playstyles into gamingProfile; only fall back for spreadsheet uploads.
      values: t => many(t.segments.gamer_type || (t.segments.playstyles ? '' : t.gamingProfile)),
      sub: v => v, clause: v => `identify as ${v}` },
    { key: 'gamingPrefs', label: 'Gaming prefs', group: 'playstyle', multi: true,
      values: t => many(t.segments.gaming_pref),
      sub: v => `prefer ${v}` },
    { key: 'hours', label: 'Hours a week', group: 'playstyle', ordered: true,
      values: t => one(t.segments.gaming_hours),
      sub: v => `${hoursText(v)} a week`, clause: v => `play ${hoursText(v)} a week` },
  ];
}

/** Sort key for range labels like "<18", "18-24", "35+", "10–20 hours". */
function rangeKey(label: string): number | null {
  const n = label.match(/\d+(?:\.\d+)?/);
  if (!n) return null;
  return Number(n[0]) - (/^\s*(<|under|less|below|up to)/i.test(label) ? 0.5 : 0);
}

const MAX_COLUMNS = 6;

/**
 * Past six answers, keep the top five and roll the rest into "Other". Its count
 * is testers who picked any of the rolled-up answers, so a multi-select tester
 * is counted once and the column stays a share of `base`.
 */
function rollUp(rows: Row[], answers: string[][], base: number): Row[] {
  if (rows.length <= MAX_COLUMNS) return rows;
  const rest = new Set(rows.slice(MAX_COLUMNS - 1).map(r => r.label));
  const other = answers.filter(a => a.some(v => rest.has(v))).length;
  return [...rows.slice(0, MAX_COLUMNS - 1), { label: 'Other', count: other, pct: pctOf(other, base) }];
}

const testersText = (base: number, total: number) =>
  base === total ? `${base} ${base === 1 ? 'tester' : 'testers'}` : `${base} of ${total} testers`;

function buildAttribute(def: Def, testers: Tester[]): Attribute | null {
  const answers = testers.map(def.values).filter(v => v.length > 0);
  if (!answers.length) return null;
  const base = answers.length;
  const counted = countRows(answers.flat(), base);
  const ordered = !def.multi && !!def.ordered && counted.length > 1 && counted.every(r => rangeKey(r.label) !== null);
  const rows = ordered
    ? [...counted].sort((a, b) => rangeKey(a.label)! - rangeKey(b.label)!)
    : rollUp(counted, answers, base);

  const top = counted[0];
  const yesNo = def.yesNo && counted.every(r => def.yesNo!.isYes(r.label) || /^(no|n|false)\b/i.test(r.label) || r.label === 'Outside target')
    ? def.yesNo : undefined;
  let headline: Attribute['headline'];
  let clause: string;
  if (yesNo) {
    const yes = counted.filter(r => yesNo.isYes(r.label)).reduce((n, r) => n + r.count, 0);
    headline = { pct: pctOf(yes, base), text: yesNo.sub };
    clause = yesNo.sub;
  } else {
    headline = { pct: top.pct, text: def.sub(top.label) };
    clause = def.clause?.(top.label) ?? def.sub(top.label);
  }

  return {
    key: def.key,
    label: def.label,
    group: def.group,
    ordered,
    rows,
    top,
    base,
    source: `${def.multi ? 'Multi-select' : 'Single choice'} · ${testersText(base, testers.length)}`,
    headline,
    clause,
  };
}

const STEAM_BUCKETS: { label: string; min: number }[] = [
  { label: '<50h', min: 0 },
  { label: '50–200h', min: 50 },
  { label: '200–500h', min: 200 },
  { label: '500–1,000h', min: 500 },
  { label: '1,000h+', min: 1000 },
];

/** Steam hours: percentages are of Steam-linked testers only. */
function steamAttribute(testers: Tester[]): Attribute | null {
  const hours = testers.flatMap(t => { const h = steamHours(t); return h === undefined ? [] : [h]; });
  if (!hours.length) return null;
  const base = hours.length;
  const bucketOf = (h: number) => [...STEAM_BUCKETS].reverse().find(b => h >= b.min)!.label;
  const counted = countRows(hours.map(bucketOf), base);
  const rows = STEAM_BUCKETS.map(b => counted.find(r => r.label === b.label) ?? { label: b.label, count: 0, pct: 0 });
  const pct = pctOf(hours.filter(h => h >= CORE_AUDIENCE_HOURS).length, base);
  return {
    key: 'steam',
    label: 'Steam hours',
    group: 'playstyle',
    ordered: true,
    rows,
    top: counted[0],
    base,
    source: `From ${base} linked Steam ${base === 1 ? 'library' : 'libraries'}`,
    headline: { pct, text: `${CORE_AUDIENCE_HOURS}h+ on Steam` },
    clause: `have ${CORE_AUDIENCE_HOURS}h+ on Steam`,
  };
}

export interface AttributeGroup {
  key: GroupKey;
  label: string;
  attributes: Attribute[];
  summary: string;
}

function quantifier(pct: number): string {
  if (pct === 100) return 'all';
  if (pct >= 90) return 'nearly all';
  if (pct >= 67) return 'most';
  if (pct > 50) return 'over half';
  if (pct === 50) return 'half';
  if (pct >= 34) return 'over a third';
  return `${pct}%`;
}

/** "Over half are aged 25–34, most are male, and nearly all have a mic." */
export function groupSummary(attributes: Attribute[]): string {
  const parts = attributes.slice(0, 3).map(a => `${quantifier(a.headline.pct)} ${a.clause}`);
  if (!parts.length) return '';
  const last = parts[parts.length - 1];
  const text = parts.length === 1 ? last
    : parts.length === 2 ? `${parts[0]} and ${last}`
    : `${parts.slice(0, -1).join(', ')}, and ${last}`;
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

// ── Typical tester ───────────────────────────────────────────────────────────

/** One cell of the typical-tester grid: the most common answer to one question. */
export interface Trait {
  key: string;
  label: string;
  value: string;
  count: number;
  base: number;
  pct: number;
}

type Answered = Pick<Attribute, 'top' | 'base'>;

const TRAITS: [key: string, label: string][] = [
  ['age', 'Age'], ['gender', 'Gender'], ['country', 'Country'], ['platform', 'Platform'],
  ['hours', 'Hours a week'], ['genres', 'Top genre'], ['playstyle', 'Playstyle'], ['steam', 'Steam library'],
];
/** Stand-ins when some main traits have no answers, so the grid can still fill two rows. */
const SPARE_TRAITS: [key: string, label: string][] = [
  ['hardware', 'Hardware tier'], ['controller', 'Controller'], ['mic', 'Microphone'],
];

function countryAnswers(testers: Tester[]): Answered | null {
  const known = testers.map(testerCountry).filter(c => !isUnknown(c));
  return known.length ? { top: countRows(known, known.length)[0], base: known.length } : null;
}

/** Most common answer per trait; 8 or 4 of them so every grid row is full. */
function typicalTraits(attributes: Attribute[], testers: Tester[]): Trait[] {
  const byKey = new Map<string, Answered>(attributes.map(a => [a.key, a]));
  const country = countryAnswers(testers);
  if (country) byKey.set('country', country);
  // Playstyle and gamer type describe the same thing for different form sources.
  const playstyle = byKey.get('playstyles') ?? byKey.get('gamerType');
  if (playstyle) byKey.set('playstyle', playstyle);

  const traits = [...TRAITS, ...SPARE_TRAITS].flatMap(([key, label]) => {
    const a = byKey.get(key);
    return a ? [{ key, label, value: a.top.label, count: a.top.count, base: a.base, pct: a.top.pct }] : [];
  });
  return traits.slice(0, traits.length >= 8 ? 8 : traits.length >= 4 ? 4 : traits.length);
}

export interface PlayerInsights {
  groups: AttributeGroup[];
  traits: Trait[];
  steamLinked: number;
}

export function playerInsights(testers: Tester[], config: GameConfig, targets?: string[]): PlayerInsights {
  const attributes = [
    ...definitions(config, targets).map(def => buildAttribute(def, testers)),
    steamAttribute(testers),
  ].filter((a): a is Attribute => a !== null);

  const groups = (Object.keys(GROUP_LABELS) as GroupKey[]).flatMap(key => {
    const inGroup = attributes.filter(a => a.group === key);
    return inGroup.length ? [{ key, label: GROUP_LABELS[key], attributes: inGroup, summary: groupSummary(inGroup) }] : [];
  });

  return { groups, traits: typicalTraits(attributes, testers), steamLinked: testers.filter(isSteamLinked).length };
}
