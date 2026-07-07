import * as XLSX from 'xlsx';
import type { SegmentKey, TesterSegments } from './types';
import {
  classifySegmentColumn, deriveHardwareTier, findColumn, safeIso,
  EMAIL_PATTERNS, ID_PATTERNS, DISCORD_PATTERNS,
} from './parser';
import { normalizeEmail, type RegistryRecord } from './registry';

// Platform-ID columns aren't segments; match them directly by header.
const PLATFORM_PATTERNS: Record<'steam64' | 'epic' | 'psn' | 'xbox', RegExp> = {
  steam64: /steam64|steam.?id/i,
  epic: /epic.?account|epic.?id/i,
  psn: /playstation|psn/i,
  xbox: /xbox|gamertag/i,
};

// The registration Discord field ("What is your exact Discord username?") is
// unreliable in Playlytix (mostly "no"), so we keep it but never join on it.
const REG_DISCORD_PATTERN = /discord.?username|exact discord/i;

function rowToRecord(row: Record<string, unknown>, headers: string[]): RegistryRecord | null {
  const emailCol = findColumn(headers, [EMAIL_PATTERNS]);
  const email = normalizeEmail(emailCol ? row[emailCol] : '');
  if (!email) return null; // skip the ~50k empty padding rows

  const idCol = findColumn(headers, [ID_PATTERNS]) ?? headers[0];
  const rawId = String(row[idCol] ?? '').trim();
  const playlytixId = /^\d+$/.test(rawId) ? Number(rawId) : null;

  const discordCol = findColumn(headers, [REG_DISCORD_PATTERN, DISCORD_PATTERNS]);
  const discord = discordCol ? String(row[discordCol] ?? '').trim() : '';

  const segments: TesterSegments = {};
  const platform = { steam64: '', epic: '', psn: '', xbox: '' };
  let cpu = '', gpu = '', ram = '';

  for (const header of headers) {
    const value = String(row[header] ?? '').trim();
    if (!value) continue;

    const seg = classifySegmentColumn(header);
    if (seg === 'hw_cpu') { cpu = value; continue; }
    if (seg === 'hw_gpu') { gpu = value; continue; }
    if (seg === 'hw_ram') { ram = value; continue; }
    if (seg) { segments[seg as SegmentKey] = value; continue; }

    for (const [key, re] of Object.entries(PLATFORM_PATTERNS)) {
      if (re.test(header)) { platform[key as keyof typeof platform] = value; break; }
    }
  }

  // Always record a hardware tier (mirrors the parser) so 'Unknown' is visible.
  segments.hardware_tier = deriveHardwareTier(ram, gpu);

  return {
    playlytixId,
    email,
    discord,
    segments,
    cpu, gpu, ram,
    ...platform,
    registeredAt: safeIso(findColumn(headers, [/timestamp|^date$/i]) ? row[findColumn(headers, [/timestamp|^date$/i])!] : null),
    rawJson: row as Record<string, unknown>,
  };
}

/**
 * Parse the Playlytix registration export into deduped registry records.
 * Drops empty padding rows and, when an email appears more than once, keeps the
 * record with the latest `registeredAt` timestamp.
 */
export function parsePlaylytix(buffer: ArrayBuffer): RegistryRecord[] {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
  if (rows.length === 0) return [];
  const headers = Object.keys(rows[0]);

  const byEmail = new Map<string, RegistryRecord>();
  for (const row of rows) {
    const rec = rowToRecord(row, headers);
    if (!rec) continue;
    const existing = byEmail.get(rec.email);
    if (!existing || rec.registeredAt >= existing.registeredAt) {
      byEmail.set(rec.email, rec);
    }
  }
  return [...byEmail.values()];
}

/**
 * Parse the "Type of Gamer" export into an email → { genres, playstyles } map.
 * Uses the comma-joined multi-select columns and ignores the redundant boolean
 * grid columns (one per genre) that Google Forms also emits.
 */
export function parseTypeOfGamer(buffer: ArrayBuffer): Map<string, { genres: string; playstyles: string }> {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
  const map = new Map<string, { genres: string; playstyles: string }>();
  if (rows.length === 0) return map;
  const headers = Object.keys(rows[0]);

  const emailCol = findColumn(headers, [EMAIL_PATTERNS]);
  const genresCol = findColumn(headers, [/what genres|genres.*play/i]);
  const playstylesCol = findColumn(headers, [/preferred playstyle|playstyles?/i]);
  if (!emailCol) return map;

  for (const row of rows) {
    const email = normalizeEmail(row[emailCol]);
    if (!email) continue;
    map.set(email, {
      genres: genresCol ? String(row[genresCol] ?? '').trim() : '',
      playstyles: playstylesCol ? String(row[playstylesCol] ?? '').trim() : '',
    });
  }
  return map;
}

/**
 * Left-join Playlytix records with Type-of-Gamer genres/playstyles by email.
 * Playlytix is the authoritative set; the gamer file only enriches segments.
 */
export function mergeRegistry(
  playlytix: RegistryRecord[],
  gamer: Map<string, { genres: string; playstyles: string }>,
): RegistryRecord[] {
  return playlytix.map((rec) => {
    const extra = gamer.get(rec.email);
    if (!extra) return rec;
    const segments = { ...rec.segments };
    if (extra.genres) segments.genres = extra.genres;
    if (extra.playstyles) segments.playstyles = extra.playstyles;
    return { ...rec, segments };
  });
}
