import 'server-only';
import type { TesterSegments } from '../types';
import { normalizeEmail, type RegistryRecord } from '../registry';
import { getServiceClient } from './server';

interface TesterRow {
  email: string;
  playlytix_id: number | null;
  discord: string | null;
  segments: TesterSegments;
  cpu: string | null;
  gpu: string | null;
  ram: string | null;
  steam64: string | null;
  epic: string | null;
  psn: string | null;
  xbox: string | null;
  raw_json: Record<string, unknown> | null;
  updated_at?: string;
}

function recordToRow(rec: RegistryRecord): TesterRow {
  return {
    email: rec.email,
    playlytix_id: rec.playlytixId,
    discord: rec.discord || null,
    segments: rec.segments,
    cpu: rec.cpu || null,
    gpu: rec.gpu || null,
    ram: rec.ram || null,
    steam64: rec.steam64 || null,
    epic: rec.epic || null,
    psn: rec.psn || null,
    xbox: rec.xbox || null,
    raw_json: rec.rawJson ?? null,
    updated_at: new Date().toISOString(),
  };
}

function rowToRecord(row: TesterRow): RegistryRecord {
  return {
    email: row.email,
    playlytixId: row.playlytix_id,
    discord: row.discord ?? '',
    segments: row.segments ?? {},
    cpu: row.cpu ?? '',
    gpu: row.gpu ?? '',
    ram: row.ram ?? '',
    steam64: row.steam64 ?? '',
    epic: row.epic ?? '',
    psn: row.psn ?? '',
    xbox: row.xbox ?? '',
    registeredAt: row.updated_at ?? '',
    rawJson: row.raw_json ?? {},
  };
}

function mergeForRefresh(existing: RegistryRecord | undefined, incoming: RegistryRecord): RegistryRecord {
  if (!existing) return incoming;
  const segments = { ...existing.segments, ...incoming.segments };
  if (
    incoming.segments.hardware_tier === 'Unknown' &&
    existing.segments.hardware_tier &&
    existing.segments.hardware_tier !== 'Unknown'
  ) {
    segments.hardware_tier = existing.segments.hardware_tier;
  }
  return {
    ...incoming,
    playlytixId: incoming.playlytixId ?? existing.playlytixId,
    discord: incoming.discord || existing.discord,
    segments,
    cpu: incoming.cpu || existing.cpu,
    gpu: incoming.gpu || existing.gpu,
    ram: incoming.ram || existing.ram,
    steam64: incoming.steam64 || existing.steam64,
    epic: incoming.epic || existing.epic,
    psn: incoming.psn || existing.psn,
    xbox: incoming.xbox || existing.xbox,
    registeredAt: incoming.registeredAt || existing.registeredAt,
    rawJson: Object.keys(incoming.rawJson ?? {}).length > 0 ? incoming.rawJson : existing.rawJson,
  };
}

/** Upsert registry records on email. Returns the number upserted. */
export async function upsertTesters(records: RegistryRecord[]): Promise<number> {
  const client = getServiceClient();
  if (!client) throw new Error('Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).');

  // Refreshes often omit the optional Type-of-Gamer export. Merge with the
  // stored profile first so absent enrichment is not interpreted as a request
  // to erase genres, playstyles, platform ids, or hardware details.
  const existing = await matchTestersByEmail(records.map((r) => r.email));
  const rows = records.map((record) =>
    recordToRow(mergeForRefresh(existing[normalizeEmail(record.email)], record)),
  );
  // Chunk to stay well under payload limits for large registries.
  const CHUNK = 500;
  let upserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error } = await client.from('testers').upsert(slice, { onConflict: 'email' });
    if (error) throw new Error(error.message);
    upserted += slice.length;
  }
  return upserted;
}

/** Fetch registry records for the given emails, keyed by normalized email. */
export async function matchTestersByEmail(emails: string[]): Promise<Record<string, RegistryRecord>> {
  const client = getServiceClient();
  if (!client) throw new Error('Supabase is not configured.');

  const normalized = [...new Set(emails.map(normalizeEmail).filter(Boolean))];
  const out: Record<string, RegistryRecord> = {};
  const CHUNK = 300;
  for (let i = 0; i < normalized.length; i += CHUNK) {
    const slice = normalized.slice(i, i + CHUNK);
    const { data, error } = await client.from('testers').select('*').in('email', slice);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as TesterRow[]) {
      out[row.email] = rowToRecord(row);
    }
  }
  return out;
}
