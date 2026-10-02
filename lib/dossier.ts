import type { Question, Response, Tester, TesterRegistryProfile, TesterVideo } from './types';
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

export function profileGenreFit(tester: Tester, config: GameConfig, targets?: string[]) {
  if (tester.inRegistry !== true) return { value: tester.inRegistry === undefined ? '—' : 'Unknown', reason: 'profile data unavailable' };
  const configured = targets === undefined ? config : { ...config, targetGenres: targets.map(label => ({ label, match: new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') })) };
  const fit = genreFit(tester, configured);
  if (!fit.target.length) return { value: 'Not set', reason: 'test has no target genres' };
  if (fit.unknown) return { value: 'Unknown', reason: 'genre preferences unavailable' };
  return { value: fit.isFit ? 'Target genre' : 'Outside target', reason: fit.isFit ? fit.matched.join(', ') : 'no target genres matched' };
}

export function filterTesterList(testers: Tester[], search: string, filter: string, responses: Response[], questions: Question[], config: GameConfig, targets?: string[]) {
  return testers.filter(t => {
    if (search && !getTesterDisplayName(t).toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === 'target_genre') return profileGenreFit(t, config, targets).value === 'Target genre';
    if (filter === 'detailed') return engagement(t.id, responses, questions).tier === 'detailed';
    if (filter === 'unmatched') return t.inRegistry === false;
    return filter === 'all' || !!t.quality?.flags.some(f => f.type === filter);
  }).sort((a, b) => getTesterDisplayName(a).localeCompare(getTesterDisplayName(b), undefined, { numeric: true }));
}

export function videoFiles(files: TesterVideo[] = []) {
  return files.filter(f => f.mimeType?.startsWith('video/') || /\.(mp4|webm|mov|m4v|avi|mkv|ogv)(?:[?#]|$)/i.test(f.name ?? f.url ?? ''))
    .sort((a, b) => (Date.parse(a.uploadedAt ?? '') || 0) - (Date.parse(b.uploadedAt ?? '') || 0));
}

export const registryGroups: { title: string; fields: [keyof TesterRegistryProfile, string][] }[] = [
  { title: 'Gaming habits', fields: [['sessionLength', 'Session length'], ['playTimes', 'Play times'], ['motivations', 'Motivation'], ['usesVoiceChat', 'Voice chat']] },
  { title: 'Setup', fields: [['gpu', 'GPU'], ['cpu', 'CPU'], ['ram', 'RAM'], ['hasVR', 'VR'], ['hasScreenRecorder', 'Recorder'], ['internetQuality', 'Internet']] },
  { title: 'Buying & discovery', fields: [['monthlySpend', 'Monthly spend'], ['typicalGamePrice', 'Typical price'], ['buyTiming', 'Buys on sale'], ['wishlistHabit', 'Wishlist'], ['playsEarlyAccess', 'Early access'], ['mtxSpending', 'Microtransactions'], ['discoveryChannels', 'Discovery channels'], ['trustedVoices', 'Trusted source'], ['watchesReviews', 'Watches reviews'], ['steamReviews', 'Steam reviews'], ['gameStores', 'Stores'], ['backsCrowdfunding', 'Crowdfunding']] },
];
