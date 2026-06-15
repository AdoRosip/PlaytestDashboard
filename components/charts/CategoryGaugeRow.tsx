'use client';
import Link from 'next/link';

interface GaugeCat {
  id: string;
  name: string;
  avg: number; // 0–100 normalized
  n: number;
}

function Gauge({ id, name, avg }: GaugeCat) {
  const score = Math.round(avg);
  const r = 44;
  const size = 112;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const filled = (score / 100) * circumference;

  const color =
    score >= 70 ? '#00FFFF' :
    score >= 45 ? '#0066FF' :
    '#6366f1';

  return (
    <Link
      href={`/categories/${id}`}
      className="flex flex-col items-center gap-3 group"
    >
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          viewBox={`0 0 ${size} ${size}`}
          width={size}
          height={size}
          style={{ transform: 'rotate(-90deg)' }}
        >
          {/* Track */}
          <circle
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke="rgba(71,85,105,0.35)"
            strokeWidth="7"
          />
          {/* Fill */}
          <circle
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={color}
            strokeWidth="7"
            strokeDasharray={`${filled} ${circumference}`}
            strokeLinecap="round"
            style={{ filter: score >= 70 ? 'drop-shadow(0 0 6px rgba(0,255,255,0.5))' : 'none' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className="text-xl font-bold leading-none"
            style={{ color }}
          >
            {score}
          </span>
        </div>
      </div>
      <span className="text-[11px] text-slate-400 text-center leading-tight w-[112px] group-hover:text-slate-200 transition-colors line-clamp-2 px-1">
        {name}
      </span>
    </Link>
  );
}

interface Props {
  categories: GaugeCat[];
}

export default function CategoryGaugeRow({ categories }: Props) {
  if (categories.length === 0) {
    return (
      <div className="rounded-2xl bg-slate-800/20 border border-slate-700/60 p-10 text-center">
        <p className="text-sm text-slate-500">No category data yet — upload your Excel file</p>
      </div>
    );
  }

  return (
    <div className="flex items-start justify-between gap-4 overflow-x-auto pb-2 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-700">
      {categories.map((cat) => (
        <Gauge key={cat.id} {...cat} />
      ))}
    </div>
  );
}
