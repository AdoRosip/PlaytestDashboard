import type { Question, Response, Tester, TesterRegistryProfile, TesterFile } from './types';
import type { GameConfig } from './games';
import { engagement, genreFit } from './testerProfile';
import { getTesterDisplayName } from './testerIdentity';

export function profileText(value: string): string {
  return value.replace(/[^\s<>"\[\]]+@[^\s<>"\[\]]+/g, '[redacted]');
}

export function profileDate(value?: string): string | undefined {
  if (!value || !Number.isFinite(Date.parse(value))) return undefined;
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value));
}

export function ratingScale(q: Question) {
  return { min: q.scaleMin ?? 1, max: q.scaleMax ?? (q.type === 'rating_1_10' ? 10 : 5) };
}

export function isRating(q: Question, r: Response) {
  return (q.type === 'rating_1_5' || q.type === 'rating_1_10') && r.numericValue !== null && Number.isFinite(r.numericValue);
}

export function profileAnswers(testerId: string, responses: Response[], questions: Question[]) {
  const indices = new Map(questions.map((q, i) => [q.id, { q, index: q.displayOrder ?? i + 1 }]));
  return responses.filter(r => r.testerId === testerId && r.rawAnswer.trim()).flatMap(r => {
    const entry = indices.get(r.questionId);
    if (!entry || ['internal_admin', 'timestamp', 'file_upload'].includes(entry.q.type)) return [];
    return [{ ...entry, response: r, rating: isRating(entry.q, r) }];
  }).sort((a, b) => a.index - b.index);
}

export function ratingAverages(responses: Response[], questions: Question[]) {
  const questionMap = new Map(questions.map(q => [q.id, q]));
  const values = new Map<string, number[]>();
  const normalized: number[] = [];
  for (const r of responses) {
    const q = questionMap.get(r.questionId);
    if (!q || !isRating(q, r)) continue;
    const { min, max } = ratingScale(q);
    const value = r.numericValue!;
    if (value < min || value > max || max <= min) continue;
    values.set(q.id, [...(values.get(q.id) ?? []), value]);
    // TODO(spec): mixed-scale summary is unspecified. Normalize onto 1–5
    // without reversing the tester's stated rating; rows retain their own scale.
    normalized.push(1 + (value - min) / (max - min) * 4);
  }
  const mean = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined;
  return { overall: mean(normalized), questions: new Map([...values].map(([key, xs]) => [key, mean(xs)!])) };
}

/**
 * `value` stays one of a few fixed labels (filters and counts compare against it).
 * With the Portal's Steam match for the test's target genres, fit is "has any
 * Steam hours in them" and `hours` carries the number, as on the Portal's
 * matchmaking; otherwise it falls back to the tester's stated genre preferences.
 */
export function profileGenreFit(tester: Tester, config: GameConfig, targets?: string[]): { value: string; reason: string; hours?: number } {
  if (tester.inRegistry !== true) return { value: tester.inRegistry === undefined ? '—' : 'Unknown', reason: 'profile data unavailable' };
  const match = tester.profile?.steam?.match;
  if (targets?.length && match) {
    return { value: match.genreHours > 0 ? 'Target genre' : 'Outside target', hours: match.genreHours,
      reason: `${targets.join(', ')} on Steam${match.partial ? ' · partial data' : ''}` };
  }
  const configured = targets === undefined ? config : { ...config, targetGenres: targets.map(label => ({ label, match: new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') })) };
  const fit = genreFit(tester, configured);
  if (!fit.target.length) return { value: 'Not set', reason: 'test has no target genres' };
  if (fit.unknown) return { value: 'Unknown', reason: 'genre preferences unavailable' };
  return { value: fit.isFit ? 'Target genre' : 'Outside target', reason: fit.isFit ? fit.matched.join(', ') : 'no target genres matched' };
}

export const CORE_AUDIENCE_HOURS = 50;

/**
 * Plays one of the test's target genres and has 50h+ on a linked Steam
 * library. The registry only exposes total Steam hours (not per genre), so the
 * genre half comes from the tester's stated preferences.
 */
export function isCoreAudience(tester: Tester, config: GameConfig, targets?: string[]) {
  return (tester.profile?.steam?.totalHours ?? 0) >= CORE_AUDIENCE_HOURS && profileGenreFit(tester, config, targets).value === 'Target genre';
}

/** Roster quick filters. `filter` is a comma-separated list; every listed filter must match. */
export function filterTesterList(testers: Tester[], search: string, filter: string, responses: Response[], questions: Question[], config: GameConfig, targets?: string[]) {
  const query = search.trim().toLowerCase();
  const filters = filter.split(',').filter(f => f && f !== 'all');
  const matches = (t: Tester, f: string) => {
    if (f === 'target_genre') return profileGenreFit(t, config, targets).value === 'Target genre';
    if (f === 'core') return isCoreAudience(t, config, targets);
    if (f === 'detailed') return engagement(t.id, responses, questions).tier === 'detailed';
    if (f === 'unmatched') return t.inRegistry === false;
    if (f === 'recording') return videoFiles(t.files).length > 0;
    if (f === 'flagged') return !!t.quality?.flags.length;
    return !!t.quality?.flags.some(flag => flag.type === f);
  };
  return testers.filter(t => {
    if (query && !getTesterDisplayName(t).toLowerCase().includes(query)
      && !(t.segments.country || t.country || '').toLowerCase().includes(query)) return false;
    return filters.every(f => matches(t, f));
  }).sort((a, b) => getTesterDisplayName(a).localeCompare(getTesterDisplayName(b), undefined, { numeric: true }));
}

export function isVideo(f: TesterFile) {
  return !!f.mimeType?.startsWith('video/') || /\.(mp4|webm|mov|m4v|avi|mkv|ogv)(?:[?#]|$)/i.test(f.name ?? f.url ?? '');
}
export function isImage(f: TesterFile) {
  return !!f.mimeType?.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|avif)(?:[?#]|$)/i.test(f.name ?? f.url ?? '');
}
const byUpload = (a: TesterFile, b: TesterFile) => (Date.parse(a.uploadedAt ?? '') || 0) - (Date.parse(b.uploadedAt ?? '') || 0);

export function videoFiles(files: TesterFile[] = []) {
  return files.filter(isVideo).sort(byUpload);
}

/** Screenshots grouped under the File question they were uploaded to, in questionnaire order. */
export function screenshotGroups(files: TesterFile[] = [], questions: Question[]) {
  const order = new Map(questions.map((q, i) => [q.id, { q, index: q.displayOrder ?? i + 1 }]));
  const groups = new Map<string, { q?: Question; index: number; files: TesterFile[] }>();
  for (const file of files.filter(f => !isVideo(f) && isImage(f)).sort(byUpload)) {
    const entry = file.questionId ? order.get(file.questionId) : undefined;
    const key = entry ? entry.q.id : '';
    const group = groups.get(key) ?? { q: entry?.q, index: entry?.index ?? Infinity, files: [] };
    group.files.push(file);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.index - b.index);
}

export const registryGroups: { title: string; fields: [keyof TesterRegistryProfile, string][] }[] = [
  { title: 'Gaming habits', fields: [['sessionLength', 'Session length'], ['playTimes', 'Play times'], ['motivations', 'Motivation'], ['usesVoiceChat', 'Voice chat']] },
  { title: 'Setup', fields: [['gpu', 'GPU'], ['cpu', 'CPU'], ['ram', 'RAM'], ['hasVR', 'VR'], ['hasScreenRecorder', 'Recorder'], ['internetQuality', 'Internet']] },
  { title: 'Buying & discovery', fields: [['monthlySpend', 'Monthly spend'], ['typicalGamePrice', 'Typical price'], ['buyTiming', 'Buys on sale'], ['wishlistHabit', 'Wishlist'], ['playsEarlyAccess', 'Early access'], ['mtxSpending', 'Microtransactions'], ['discoveryChannels', 'Discovery channels'], ['trustedVoices', 'Trusted source'], ['watchesReviews', 'Watches reviews'], ['steamReviews', 'Steam reviews'], ['gameStores', 'Stores'], ['backsCrowdfunding', 'Crowdfunding']] },
];
