'use client';
import { useMemo } from 'react';
import Link from '@/components/layout/ReportLink';
import type { Tester } from '@/lib/types';
import { computeTesterSegments } from '@/lib/utils';
import s from './overview.module.css';

interface Props {
  testers: Tester[];
}

interface Row { label: string; count: number }

/** Stacked-bar tones, largest segment first. */
const TONES = ['#00FFFF', '#0066FF', '#1B4C78', '#08246B'];

/** Top three groups plus an "Other" bucket, so a bar never needs a fifth tone. */
function topGroups(rows: Row[]): Row[] {
  const known = rows.filter(r => r.label !== 'Unknown');
  if (known.length <= TONES.length) return known;
  const head = known.slice(0, TONES.length - 1);
  const other = known.slice(TONES.length - 1).reduce((n, r) => n + r.count, 0);
  return [...head, { label: 'Other', count: other }];
}

function Attribute({ label, rows }: { label: string; rows: Row[] }) {
  const total = rows.reduce((n, r) => n + r.count, 0);
  return (
    <div className={`${s.attr} groove-t-soft`}>
      <div className={s.attrLabel}>{label}</div>
      <div className={s.stack} role="img" aria-label={`${label}: ${rows.map(r => `${r.label} ${r.count}`).join(', ')}`}>
        {rows.map((r, i) => (
          <span key={r.label} className={s.stackSeg} style={{ flexGrow: r.count / total, background: TONES[i] }} />
        ))}
      </div>
      <div className={s.legend}>
        {rows.map((r, i) => (
          <span key={r.label} className={s.legendItem}>
            <span className={s.dot} style={{ background: TONES[i] }} />
            {r.label}
            <span className={s.legendCount}>{r.count}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export default function PlayerMix({ testers }: Props) {
  const { attributes, countries } = useMemo(() => {
    const seg = computeTesterSegments(testers);
    const attributes = [
      { label: 'Gamer type', rows: topGroups(seg.gamerTypes) },
      { label: 'Age group', rows: topGroups(seg.ageGroups) },
      { label: 'Hardware tier', rows: topGroups(seg.hardwareTiers) },
    ].filter(a => a.rows.length > 0);
    const countries = new Set(
      testers.map(t => (t.country ?? '').trim()).filter(c => c && c.toLowerCase() !== 'unknown'),
    ).size;
    return { attributes, countries };
  }, [testers]);

  return (
    <>
      <div className={s.sectionHead}>
        <h2 className={s.sectionLabel}>Who are your players</h2>
        <Link href="/testers" className={s.link}>Testers →</Link>
      </div>
      {testers.length === 0 ? (
        <p className={s.empty}>No tester profiles in this cohort</p>
      ) : (
        <>
          <div className={s.total}>
            <span className={s.totalNum}>{testers.length}</span>
            <span className={s.totalText}>
              testers participated{countries > 0 && ` · ${countries} ${countries === 1 ? 'country' : 'countries'}`}
            </span>
          </div>
          {attributes.map(a => <Attribute key={a.label} {...a} />)}
        </>
      )}
    </>
  );
}
