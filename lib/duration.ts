/** Portal Duration answers are numeric minutes, not rating points or hours. */
export function parseDurationMinutes(raw: string): number | null {
  const value = raw.trim();
  if (!/^\d+(?:\.\d+)?$/.test(value)) return null;
  const minutes = Number(value);
  return Number.isFinite(minutes) ? minutes : null;
}

export function formatDurationMinutes(minutes: number): string {
  const total = Math.round(minutes);
  const hours = Math.floor(total / 60);
  const remainder = total % 60;
  return hours ? `${hours}h${remainder ? ` ${remainder}m` : ''}` : `${remainder}m`;
}
