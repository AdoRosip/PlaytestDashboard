import { cn, scoreBgColor } from '@/lib/utils';

interface ScoreBarProps {
  score: number; // 0–100
  showLabel?: boolean;
  height?: string;
}

export default function ScoreBar({ score, showLabel = true, height = 'h-1.5' }: ScoreBarProps) {
  return (
    <div className="flex items-center gap-2">
      <div className={cn('flex-1 bg-slate-700/60 rounded-full overflow-hidden', height)}>
        <div
          className={cn('h-full rounded-full transition-all', scoreBgColor(score))}
          style={{ width: `${score}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-xs text-slate-400 w-7 text-right">{score}</span>
      )}
    </div>
  );
}
