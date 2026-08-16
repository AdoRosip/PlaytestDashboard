'use client';
import { POLARITY } from '@/lib/chartColors';

interface Props {
  positive: number;
  neutral: number;
  negative: number;
  showLabels?: boolean;
}

export default function SentimentBar({ positive, neutral, negative, showLabels = true }: Props) {
  return (
    <div>
      <div className="flex rounded-full overflow-hidden h-2 mb-2.5">
        <div style={{ width: `${positive}%`, backgroundColor: POLARITY.good }} />
        <div style={{ width: `${neutral}%`, backgroundColor: POLARITY.neutral }} />
        <div style={{ width: `${negative}%`, backgroundColor: POLARITY.bad }} />
      </div>
      {showLabels && (
        <div className="flex justify-between text-[10px]">
          <span>
            <span className="font-mono font-semibold" style={{ color: POLARITY.good }}>{positive}%</span>
            <span className="text-slate-500 ml-1">Positive</span>
          </span>
          <span>
            <span className="font-mono font-semibold" style={{ color: POLARITY.neutral }}>{neutral}%</span>
            <span className="text-slate-500 ml-1">Neutral</span>
          </span>
          <span>
            <span className="font-mono font-semibold" style={{ color: POLARITY.bad }}>{negative}%</span>
            <span className="text-slate-500 ml-1">Negative</span>
          </span>
        </div>
      )}
    </div>
  );
}
