import type { TesterSegments } from './types';

/**
 * One master tester profile, as stored in the Supabase `testers` table and
 * exchanged over the import/match APIs. Segments are keyed by SegmentKey and
 * include genres/playstyles (from the "Type of Gamer" file) and hardware_tier.
 * Platform IDs are kept as their own fields for potential future linking.
 */
export interface RegistryRecord {
  playlytixId: number | null;
  email: string; // normalized: trimmed + lowercased
  discord: string;
  segments: TesterSegments;
  cpu: string;
  gpu: string;
  ram: string;
  steam64: string;
  epic: string;
  psn: string;
  xbox: string;
  /** ISO timestamp of the registration (used to dedupe by email — keep latest). */
  registeredAt: string;
  rawJson: Record<string, unknown>;
}

/** POST body for /api/testers/import. */
export interface ImportRequest {
  records: RegistryRecord[];
}

/** Response from /api/testers/import. */
export interface ImportResult {
  upserted: number;
  total: number;
}

/** POST body for /api/testers/match. */
export interface MatchRequest {
  emails: string[];
}

/** Response from /api/testers/match: registry records keyed by normalized email. */
export interface MatchResult {
  matches: Record<string, RegistryRecord>;
}

export function normalizeEmail(raw: unknown): string {
  return String(raw ?? '').trim().toLowerCase();
}
