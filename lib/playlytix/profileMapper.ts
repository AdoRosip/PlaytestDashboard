import type { TesterRegistryProfile, TesterVideo } from '../types';
import { profileText, registryGroups } from '../dossier';

function string(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? profileText(value.trim()) : undefined;
}
function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.flatMap(v => string(v) ?? []) : string(value)?.split(',').map(v => v.trim()).filter(Boolean) ?? [];
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function number(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}
function date(value: unknown): string | undefined {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : undefined;
}
function url(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const parsed = new URL(value);
    return ['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password ? value : undefined;
  } catch { return undefined; }
}

/** Keys verified against the supplied production response and api-reference.html. */
export function mapRegistryProfile(source: Record<string, unknown>): TesterRegistryProfile {
  const result: TesterRegistryProfile = {};
  for (const { fields } of registryGroups) {
    for (const [key] of fields) {
      const value = Array.isArray(source[key]) ? strings(source[key]).join(', ') : string(source[key]);
      if (value) Object.assign(result, { [key]: value });
    }
  }
  result.testedBefore = string(source.testedBefore);
  result.avoidedGenres = strings(source.avoidedGenres);
  result.languages = strings(source.languages);
  const steam = record(source.steam);
  if (number(steam.gameCount) !== undefined || number(steam.totalHours) !== undefined) {
    result.steam = { gameCount: number(steam.gameCount), totalHours: number(steam.totalHours) };
  }
  // TODO(spec): subscriptions has no group/label in the spec; omit it.
  // Steam connected, visibility, syncedAt and match are not dossier fields.
  return result;
}

export function mapProfileExtras(row: Record<string, unknown>, profile: Record<string, unknown>, testerId: string, questionIds: Map<string, string>) {
  const anonymous = typeof profile.anonymous === 'boolean' ? profile.anonymous : undefined;
  // The Portal includes registry fields inline; no separate registry lookup is needed.
  const inRegistry = typeof profile.inRegistry === 'boolean' ? profile.inRegistry
    : Object.keys(profile).some(k => ['country', 'gender', 'ageRange', 'gamingPreferences', 'testedBefore', 'gpu'].includes(k) && profile[k] != null) ? true : undefined;
  const files: TesterVideo[] = (Array.isArray(row.files) ? row.files : []).map((raw, index) => {
    const f = record(raw);
    // TODO(spec): the current API omits title, upload time, duration, thumbnail,
    // resolution and response links. Accept those optional fields when supplied;
    // otherwise retain API order and read media metadata in the browser.
    return {
      id: `${testerId}_file_${index}`, url: url(f.url), name: string(f.fileName), mimeType: string(f.contentType),
      title: string(f.title), uploadedAt: date(f.uploadedAt), durationSec: number(f.durationSec),
      width: number(f.width), height: number(f.height), thumbnailUrl: url(f.thumbnailUrl),
      questionId: questionIds.get(String(f.questionId)),
    };
  }).filter(f => f.mimeType?.startsWith('video/') || /\.(mp4|webm|mov|m4v|avi|mkv|ogv)$/i.test(f.name ?? ''));
  const comments = (Array.isArray(row.comments) ? row.comments : []).flatMap(raw => {
    const c = record(raw);
    const text = string(c.text), createdAt = date(c.createdAt);
    return text && createdAt ? [{ text, createdAt }] : [];
  });
  return {
    anonymous,
    username: anonymous === false && typeof profile.username === 'string' && !profile.username.includes('@') ? profile.username.trim() : undefined,
    inRegistry, submittedAt: date(row.submittedAt),
    profile: inRegistry === true ? mapRegistryProfile(profile) : undefined,
    files, comments,
  };
}
