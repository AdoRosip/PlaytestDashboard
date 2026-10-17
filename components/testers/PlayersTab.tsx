'use client';
import { useMemo, useState } from 'react';
import type { Tester } from '@/lib/types';
import type { GameConfig } from '@/lib/games';
import { playerInsights, type Attribute, type AttributeGroup, type Trait } from '@/lib/testerInsights';
import s from './testers.module.css';

interface Props {
  testers: Tester[];
  config: GameConfig;
  targets?: string[];
}

/** Height of the tallest column; the rest scale to it. */
const COLUMN_MAX = 72;
const COLUMN_MIN = 4;

const describe = (a: Attribute) => `${a.label}: ${a.rows.map(r => `${r.label} ${r.pct}%`).join(', ')}`;

function TypicalTester({ traits }: { traits: Trait[] }) {
  return (
    <section className={`${s.typical} groove-b`} aria-labelledby="players-typical">
      <div className={s.typicalHead}>
        <h2 id="players-typical" className={s.playersTitle}>Typical tester</h2>
        <p className={s.typicalSub}>The most common answer to each question</p>
      </div>
      <div className={`${s.traits} groove-t-soft`}>
        <dl className={s.traitGrid}>
          {traits.map(t => (
            <div key={t.key} className={s.trait}>
              <dt className={s.traitLabel}>{t.label}</dt>
              <dd className={s.traitValue} title={t.value}>{t.value}</dd>
              <dd className={s.traitShare}>{t.count} of {t.base} · {t.pct}%</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function ColumnChart({ attribute }: { attribute: Attribute }) {
  const peak = Math.max(...attribute.rows.map(r => r.count), 1);
  return (
    <div className={s.chart}>
      <div className={s.columns} role="img" aria-label={describe(attribute)}>
        {attribute.rows.map(r => (
          <div key={r.label} className={s.column}>
            <span className={s.columnPct}>{r.pct}%</span>
            <span
              className={s.columnBar}
              style={{ height: r.count ? Math.max(COLUMN_MIN, (r.count / peak) * COLUMN_MAX) : 0 }}
            />
            <span className={s.columnLabel} title={r.label}>{r.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Section({ group, open, onToggle }: {
  group: AttributeGroup;
  open: Set<string>;
  onToggle: (key: string) => void;
}) {
  return (
    <section className={`${s.section} groove-b`} aria-labelledby={`players-${group.key}`}>
      <div className={s.sectionIntro}>
        <h2 id={`players-${group.key}`} className={s.playersTitle}>{group.label}</h2>
        <p className={s.sectionSummary}>{group.summary}</p>
      </div>

      <div className={`${s.attrList} groove-t-soft`}>
        {group.attributes.map(a => {
          const isOpen = open.has(a.key);
          const detailId = `players-detail-${a.key}`;
          return (
            <div key={a.key} className={`${s.attr} ${isOpen ? s.attrOpen : ''} groove-b-soft`}>
              <button
                type="button"
                className={s.attrRow}
                aria-expanded={isOpen}
                aria-controls={detailId}
                onClick={() => onToggle(a.key)}
              >
                <span className={s.attrName}>{a.label}</span>
                <span className={s.attrValue}>
                  <span className={s.attrPct}>{a.headline.pct}%</span>
                  <span className={s.attrText} title={a.headline.text}>{a.headline.text}</span>
                </span>
                <span className={s.chevron} aria-hidden="true" />
              </button>
              <div id={detailId} className={s.attrDetail} hidden={!isOpen}>
                <div className={s.attrSource}>{a.source}</div>
                {isOpen && <ColumnChart attribute={a} />}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function PlayersTab({ testers, config, targets }: Props) {
  const insights = useMemo(() => playerInsights(testers, config, targets), [testers, config, targets]);
  // Any number of rows can be open; all start closed.
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const toggle = (key: string) => setOpen(prev => {
    const next = new Set(prev);
    if (!next.delete(key)) next.add(key);
    return next;
  });

  if (!insights.groups.length) {
    return <p className={s.mutedLine}>No profile data · 0 of {testers.length} testers have registry answers</p>;
  }

  return (
    <>
      {insights.traits.length > 0 && <TypicalTester traits={insights.traits} />}
      {insights.groups.map(g => <Section key={g.key} group={g} open={open} onToggle={toggle} />)}
    </>
  );
}
