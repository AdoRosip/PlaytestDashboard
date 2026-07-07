import type { ParseResult } from './parser';
import type { Tester } from './types';
import { normalizeEmail, type MatchResult, type RegistryRecord } from './registry';

/** Derive the `hardware` display string the parser uses, from a registry record. */
function hardwareLabel(rec: RegistryRecord): string {
  const tier = rec.segments.hardware_tier;
  if (tier && tier !== 'Unknown') return `${tier}-end`;
  return rec.gpu || rec.ram || 'Unknown';
}

/** Merge a registry profile onto a parsed (placeholder) tester. */
function applyRegistry(tester: Tester, rec: RegistryRecord): Tester {
  return {
    ...tester,
    playlytixId: rec.playlytixId ?? undefined,
    inRegistry: true,
    testerId: rec.playlytixId != null ? `P-${rec.playlytixId}` : tester.testerId,
    discord: tester.discord || rec.discord,
    segments: { ...rec.segments, ...tester.segments },
    ageGroup: rec.segments.age_group ?? tester.ageGroup,
    country: rec.segments.country ?? tester.country,
    gamingProfile: rec.segments.gamer_type ?? tester.gamingProfile,
    hardware: hardwareLabel(rec),
    rawProfileJson: rec.rawJson,
  };
}

/**
 * Look up parsed participant testers against the Supabase registry by email and
 * merge in their profiles. Feedback workbooks carry no registration sheet, so
 * every tester starts as a placeholder; this is what gives them demographics.
 *
 * Degrades gracefully: on any network/backend error (including the backend not
 * being configured yet) it returns the parse result unchanged with a warning,
 * so uploads never hard-fail on registry lookup.
 */
export async function enrichTestersFromRegistry(
  result: ParseResult,
): Promise<{ result: ParseResult; warning?: string }> {
  const emails = [...new Set(result.testers.map((t) => normalizeEmail(t.email)).filter(Boolean))];
  if (emails.length === 0) return { result };

  let matches: Record<string, RegistryRecord> = {};
  try {
    const res = await fetch('/api/testers/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emails }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return { result, warning: body.error ?? `Registry lookup failed (HTTP ${res.status}).` };
    }
    matches = ((await res.json()) as MatchResult).matches ?? {};
  } catch (err) {
    return { result, warning: err instanceof Error ? err.message : 'Registry lookup failed.' };
  }

  // Assign a registry verdict per tester. Only flag `inRegistry: false` for
  // genuine placeholders (no existing profile) — a tester who already carries
  // registration data (e.g. Exovia's embedded "Synced Registration" sheet) is
  // not mislabeled just because their email isn't in this Supabase registry yet.
  let matched = 0;
  const testers = result.testers.map((t) => {
    const rec = matches[normalizeEmail(t.email)];
    if (rec) { matched++; return applyRegistry(t, rec); }
    const hasProfile = Object.keys(t.segments).length > 0;
    return hasProfile ? t : { ...t, inRegistry: false as const };
  });

  // Reflect match status only on testers we actually resolved — leave everyone
  // else's response.matchStatus as the parser set it.
  const matchedIds = new Set(testers.filter((t) => t.inRegistry === true).map((t) => t.id));
  const unmatchedIds = new Set(testers.filter((t) => t.inRegistry === false).map((t) => t.id));
  const responses = result.responses.map((r) => {
    if (!r.testerId) return r;
    if (matchedIds.has(r.testerId)) return { ...r, matchStatus: 'matched' as const };
    if (unmatchedIds.has(r.testerId)) return { ...r, matchStatus: 'needs_check' as const };
    return r;
  });

  const unmatched = unmatchedIds.size;
  const enriched: ParseResult = {
    ...result,
    testers,
    responses,
    project: { ...result.project, matchedTesters: matched, unmatchedTesters: unmatched },
  };

  const warning =
    matched === 0
      ? 'No testers matched the registry. Import the Playlytix registry first (Registry page).'
      : unmatched > 0
        ? `${matched} testers linked to the registry; ${unmatched} not found (kept as unmatched).`
        : undefined;

  return { result: enriched, warning };
}
