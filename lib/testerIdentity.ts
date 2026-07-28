import type { Tester } from './types';

/** Treat any identifier containing @ as private contact information. */
export function isEmailLike(value: string): boolean {
  return value.trim().includes('@');
}

function fallbackTesterLabel(fallbackId?: string): string {
  const responseRow = fallbackId?.match(/^tstr_(?:unmatched|resp)_(\d+)$/i);
  if (responseRow) return `Unmatched tester ${Number(responseRow[1]) + 1}`;

  const suffix = fallbackId?.match(/(\d+)$/)?.[1];
  return suffix ? `Unmatched tester ${suffix}` : 'Unmatched tester';
}

/**
 * Format a raw tester id for display without ever exposing an email fallback.
 * `fallbackId` is the app-internal row id and contains no contact information.
 */
export function formatTesterId(testerId: string, fallbackId?: string): string {
  const value = testerId.trim();
  if (!value || isEmailLike(value)) return fallbackTesterLabel(fallbackId);

  const legacyFallback = value.match(/^(?:unknown|unmatched)-(\d+)$/i);
  if (legacyFallback) return `Unmatched tester ${Number(legacyFallback[1]) + 1}`;

  return /^\d+$/.test(value) ? `Tester ${value}` : value;
}

/** Prefer the stable registry id, then a privacy-safe questionnaire id. */
export function formatTesterLabel(
  tester: Pick<Tester, 'id' | 'testerId' | 'playlytixId'>,
): string {
  if (tester.playlytixId != null) return `P-${tester.playlytixId}`;
  return formatTesterId(tester.testerId, tester.id);
}
