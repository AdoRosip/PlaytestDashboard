'use client';
import Link from '@/components/layout/ReportLink';
import { splitCoreScores, scoreBandColor } from '@/lib/coreScores';
import s from './overview.module.css';

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

function Ring({ id, name, score }: Scored) {
  const color = scoreBandColor(score);
  return (
    <Link href={`/categories/${id}`} className={s.ringLink}>
      <div
        role="img"
        aria-label={`${name}: ${score} out of 100`}
        className={s.ring}
        style={{ background: `conic-gradient(${color} ${score}%, rgba(255,255,255,.08) 0)` }}
      >
        <div className={s.ringInner}>
          <span aria-hidden="true" className={s.ringScore} style={{ color }}>{score}</span>
        </div>
      </div>
      <span className={s.ringName}>{name}</span>
    </Link>
  );
}

function RingColumn({ label, items }: { label: string; items: Scored[] }) {
  return (
    <div className={`${s.ringCol} groove-cell`}>
      <div className={s.subLabel}>{label}</div>
      <div className={s.ringPair}>
        {items.map(c => <Ring key={c.id} {...c} />)}
      </div>
    </div>
  );
}

function RestRow({ id, name, score }: Scored) {
  return (
    <Link href={`/categories/${id}`} className={`${s.restRow} groove-b-soft`}>
      <span className={s.restName} title={name}>{name}</span>
      <span className={s.bar} aria-hidden="true">
        <span className={s.barFill} style={{ width: `${score}%`, background: scoreBandColor(score) }} />
      </span>
      <span className={s.restScore}>{score}</span>
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
    <section className={`${s.core} groove-b`}>
      <div className={s.sectionHead}>
        <h2 className={s.sectionLabel}>Core experience scores</h2>
        <Link href="/categories" className={s.link}>Categories details →</Link>
      </div>

      {scored.length === 0 ? (
        <p className={s.empty}>No category scores yet · needs ≥3 rated responses per category</p>
      ) : layout.kind === 'row' ? (
        <div className={s.ringRow}>
          {layout.all.map(c => <Ring key={c.id} {...c} />)}
        </div>
      ) : (
        <div className={s.coreBody}>
          <div className={s.ringsGroup}>
            <RingColumn label="Strongest" items={layout.strongest} />
            <RingColumn label="Weakest" items={layout.weakest} />
          </div>
          <div className={`${s.restCol} groove-cell`}>
            <div className={s.subLabel}>The rest</div>
            <div className={s.restList}>
              {layout.rest.map(c => <RestRow key={c.id} {...c} />)}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
