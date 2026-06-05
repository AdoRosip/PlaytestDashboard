'use client';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { Category } from '@/lib/types';
import Badge from '@/components/ui/Badge';
import ScoreBar from '@/components/ui/ScoreBar';
import { scoreColor } from '@/lib/utils';

interface CategoryCardProps {
  category: Category;
  avgScore: number;
  questionCount: number;
  respondentCount: number;
  negativePct: number;
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
  topThemes: string[];
}

export default function CategoryCard({
  category, avgScore, questionCount, respondentCount, negativePct, severity, topThemes,
}: CategoryCardProps) {
  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-800/20 p-5 flex flex-col gap-4 hover:border-slate-600 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div
            className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-0.5"
            style={{ backgroundColor: category.color }}
          />
          <h3 className="text-sm font-semibold text-white">{category.name}</h3>
        </div>
        <Badge label={severity} severity={severity} variant="severity" />
      </div>

      {/* Score */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-slate-400">Avg score</span>
          <span className={`text-lg font-bold ${scoreColor(avgScore)}`}>
            {avgScore}
          </span>
        </div>
        <ScoreBar score={avgScore} showLabel={false} height="h-2" />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { label: 'Questions', value: questionCount },
          { label: 'Respondents', value: respondentCount },
          { label: '% Negative', value: `${negativePct}%` },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg bg-slate-900/50 py-2">
            <div className="text-sm font-semibold text-white">{value}</div>
            <div className="text-[10px] text-slate-500">{label}</div>
          </div>
        ))}
      </div>

      {/* Top themes */}
      {topThemes.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide">Top themes</div>
          {topThemes.slice(0, 2).map((t) => (
            <div key={t} className="text-xs text-slate-400 truncate">· {t}</div>
          ))}
        </div>
      )}

      {/* CTA */}
      <Link
        href={`/categories/${category.id}`}
        className="flex items-center justify-center gap-2 w-full py-2 rounded-lg border border-slate-700/60 text-xs text-slate-300 hover:text-white hover:border-slate-500 hover:bg-slate-700/30 transition-colors"
      >
        View detail <ArrowRight className="w-3 h-3" />
      </Link>
    </div>
  );
}
