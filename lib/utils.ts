import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Severity, Priority, QuestionType, Tester } from './types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function severityColor(severity: Severity | Priority): string {
  switch (severity) {
    case 'Critical': return 'text-red-400 bg-red-400/10 border-red-400/30';
    case 'High':     return 'text-orange-400 bg-orange-400/10 border-orange-400/30';
    case 'Medium':   return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30';
    case 'Low':      return 'text-green-400 bg-green-400/10 border-green-400/30';
  }
}

export function severityDot(severity: Severity | Priority): string {
  switch (severity) {
    case 'Critical': return 'bg-red-400';
    case 'High':     return 'bg-orange-400';
    case 'Medium':   return 'bg-yellow-400';
    case 'Low':      return 'bg-green-400';
  }
}

export function scoreColor(score: number): string {
  if (score >= 70) return 'text-[#00FFFF]';
  if (score >= 45) return 'text-[#0066FF]';
  return 'text-[#0000EE]';
}

export function scoreBgColor(score: number): string {
  if (score >= 70) return 'bg-[#00FFFF]';
  if (score >= 45) return 'bg-[#0066FF]';
  return 'bg-[#0000EE]';
}

export function normalizeScore(value: number, min: number, max: number): number {
  return Math.round(((value - min) / (max - min)) * 100);
}

export function formatScore(score: number): string {
  return score.toFixed(1);
}

export function questionTypeLabel(type: QuestionType): string {
  const map: Record<QuestionType, string> = {
    rating_1_5: '1–5 Rating',
    rating_1_10: '1–10 Rating',
    yes_no: 'Yes / No',
    multiple_choice: 'Multiple Choice',
    free_text: 'Free Text',
    file_upload: 'File Upload',
    timestamp: 'Timestamp',
    internal_admin: 'Internal',
    unknown: 'Unknown',
  };
  return map[type] ?? type;
}

export function questionTypeIcon(type: QuestionType): string {
  const map: Record<QuestionType, string> = {
    rating_1_5: '⭐',
    rating_1_10: '🔢',
    yes_no: '✓',
    multiple_choice: '◉',
    free_text: '💬',
    file_upload: '📎',
    timestamp: '🕐',
    internal_admin: '🔒',
    unknown: '?',
  };
  return map[type] ?? '?';
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

export function getInitials(name: string): string {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

export function formatTesterId(testerId: string): string {
  return /^\d+$/.test(testerId.trim()) ? `Tester ${testerId.trim()}` : testerId;
}

export interface SegmentRow {
  label: string;
  count: number;
  pct: number;
}

export interface TesterSegmentSummary {
  ageGroups: SegmentRow[];
  hardwareTiers: SegmentRow[];
  gamerTypes: SegmentRow[];
}

function segmentDistribution(values: string[], total: number): SegmentRow[] {
  const counts = new Map<string, number>();
  for (const v of values) {
    const label = v.trim() || 'Unknown';
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, count]) => ({
      label,
      count,
      pct: total > 0 ? Math.round((count / total) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function computeTesterSegments(testers: Tester[]): TesterSegmentSummary {
  const total = testers.length;

  const ageGroups = segmentDistribution(
    testers.map(t => t.segments.age_group || t.ageGroup || ''),
    total,
  );
  const hardwareTiers = segmentDistribution(
    testers.map(t => t.segments.hardware_tier || t.hardware || ''),
    total,
  );
  const gamerTypes = segmentDistribution(
    testers.flatMap(t => {
      const raw = t.segments.gamer_type || t.gamingProfile || '';
      return raw.split(',').map(v => v.trim()).filter(Boolean);
    }),
    Math.max(testers.length, 1),
  );

  return { ageGroups, hardwareTiers, gamerTypes };
}

export function avgArray(nums: (number | null)[]): number {
  const valid = nums.filter((n): n is number => n !== null);
  if (!valid.length) return 0;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

export function computeRatingDistribution(
  responses: { numericValue: number | null }[],
  scale: 5 | 10,
): { value: number; count: number; pct: number }[] {
  const buckets = Array.from({ length: scale }, (_, i) => ({ value: i + 1, count: 0, pct: 0 }));
  for (const r of responses) {
    if (r.numericValue !== null) {
      const idx = Math.round(r.numericValue) - 1;
      if (idx >= 0 && idx < scale) buckets[idx].count++;
    }
  }
  const total = buckets.reduce((s, b) => s + b.count, 0);
  if (total > 0) {
    for (const b of buckets) b.pct = Math.round((b.count / total) * 100);
  }
  return buckets;
}
