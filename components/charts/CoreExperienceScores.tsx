'use client';
import Link from '@/components/layout/ReportLink';
import { splitCoreScores, scoreBandColor } from '@/lib/coreScores';

interface Category {
  id: string;
  name: string;
  avg: number; // 0–100 normalized, higher is better
}

interface Scored {
  id: string;
  name: string;
  score: number;
}

const LABEL = 'text-[12px] text-white/[.58]';
const NAME = 'text-[13px] text-white/[.86]';

function Ring({ id, name, score }: Scored) {
  const color = scoreBandColor(score);
  return (
    <Link
      href={`/categories/${id}`}
      className="flex w-[96px] flex-col items-center gap-3 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00FFFF]/60"
    >
      <div
        role="img"
        aria-label={`${name}: ${score} out of 100`}
        className="flex h-[96px] w-[96px] flex-shrink-0 items-center justify-center rounded-full"
        style={{ background: `conic-gradient(${color} ${score}%, rgba(255,255,255,.08) 0)` }}
      >
        <div className="flex h-[82px] w-[82px] items-center justify-center rounded-full bg-[#0D1222]">
          <span aria-hidden="true" className="font-mono text-[26px] leading-none" style={{ color }}>
            {score}
          </span>
        </div>
      </div>
      <span className={`${NAME} line-clamp-2 text-center leading-[1.35]`}>{name}</span>
    </Link>
  );
}

function RingGroup({ label, items }: { label: string; items: Scored[] }) {
  return (
    <div className="min-w-0">
      <div className={`${LABEL} mb-[18px]`}>{label}</div>
      <div className="flex justify-around gap-5">
        {items.map(c => <Ring key={c.id} {...c} />)}
      </div>
    </div>
  );
}

function RestRow({ id, name, score }: Scored) {
  const color = scoreBandColor(score);
  return (
    <Link
      href={`/categories/${id}`}
      className="grid grid-cols-[minmax(0,1fr)_120px_30px] items-center gap-[14px] border-b border-white/[.05] py-2 focus:outline-none focus-visible:bg-white/[.03]"
    >
      <span className={`${NAME} truncate`} title={name}>{name}</span>
      <span className="h-1 overflow-hidden rounded-[2px] bg-white/[.07]" aria-hidden="true">
        <span className="block h-full rounded-[2px]" style={{ width: `${score}%`, background: color }} />
      </span>
      <span className="text-right font-mono text-[14px] text-white">{score}</span>
    </Link>
  );
}

export default function CoreExperienceScores({ categories }: { categories: Category[] }) {
  const scored: Scored[] = categories.map(c => ({
    id: c.id,
    name: c.name,
    score: Math.max(0, Math.min(100, Math.round(c.avg))),
  }));
  const layout = splitCoreScores(scored);

  return (
    <section className="@container mb-10 font-sans">
      <div className="mb-3.5 flex items-center gap-[14px] pr-10">
        <h2 className="font-mono text-[13px] font-normal uppercase tracking-[.08em] text-white/[.72]">
          Core experience scores
        </h2>
        <span className="h-px w-16 flex-shrink-0 bg-[rgba(0,102,255,.7)]" aria-hidden="true" />
        <Link href="/categories" className="ml-auto text-[14px] text-[#00FFFF] transition-colors hover:text-[#AFFFFF]">
          Categories details →
        </Link>
      </div>

      <div className="overflow-hidden rounded-[12px] border border-[rgba(0,255,255,.22)] bg-white/[.04]">
        {scored.length === 0 ? (
          <p className="p-10 text-center text-sm text-white/[.58]">No category data yet — upload your Excel file</p>
        ) : layout.kind === 'row' ? (
          <div className="flex flex-wrap justify-around gap-5 px-7 pb-[26px] pt-[22px]">
            {layout.all.map(c => <Ring key={c.id} {...c} />)}
          </div>
        ) : (
          <div className="grid grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] @max-[900px]:grid-cols-1">
            <div className="grid grid-cols-2 gap-7 px-7 pb-[26px] pt-[22px] @max-[520px]:grid-cols-1">
              <RingGroup label="Strongest" items={layout.strongest} />
              <RingGroup label="Weakest" items={layout.weakest} />
            </div>
            <div className="border-l border-white/[.08] px-7 pb-5 pt-[18px] @max-[900px]:border-l-0 @max-[900px]:border-t">
              <div className={`${LABEL} mb-1.5`}>The rest</div>
              {layout.rest.map(c => <RestRow key={c.id} {...c} />)}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
