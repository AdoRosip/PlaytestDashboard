'use client';

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
        <div style={{ width: `${positive}%`, backgroundColor: '#00FFFF' }} />
        <div style={{ width: `${neutral}%`, backgroundColor: '#0066FF' }} />
        <div style={{ width: `${negative}%`, backgroundColor: '#EF4444' }} />
      </div>
      {showLabels && (
        <div className="flex justify-between text-[10px]">
          <span>
            <span className="font-semibold text-[#00FFFF]">{positive}%</span>
            <span className="text-slate-500 ml-1">Positive</span>
          </span>
          <span>
            <span className="font-semibold text-[#0066FF]">{neutral}%</span>
            <span className="text-slate-500 ml-1">Neutral</span>
          </span>
          <span>
            <span className="font-semibold text-red-400">{negative}%</span>
            <span className="text-slate-500 ml-1">Negative</span>
          </span>
        </div>
      )}
    </div>
  );
}
