'use client';
import Link from '@/components/layout/ReportLink';
import s from './overview.module.css';

export interface QuestionScore {
  id: string;
  text: string;
  category: string | null;
  score: number; // 0–100 normalized
  n: number;
}

interface Props {
  best: QuestionScore[];
  worst: QuestionScore[];
}

/** 0–100 normalized → the 1–5 scale clients read ratings on. */
const toFive = (score: number) => (1 + (score / 100) * 4).toFixed(1);

function Row({ item }: { item: QuestionScore }) {
  return (
    <Link href={`/questions/${item.id}`} className={`${s.qRow} groove-t-soft`}>
      <span className={s.qBody}>
        <span className={s.qText} title={item.text}>{item.text}</span>
        {item.category && <span className={`${s.qCat} block`}>{item.category}</span>}
      </span>
      <span className={s.qScore} title={`${item.score}/100 · n=${item.n}`}>
        {toFive(item.score)}<span className={s.unit}>/5</span>
      </span>
    </Link>
  );
}

function List({ label, color, items }: { label: string; color: string; items: QuestionScore[] }) {
  if (items.length === 0) return null;
  return (
    <div className={s.list}>
      <div className={s.listLabel} style={{ color }}>{label}</div>
      {items.map(item => <Row key={item.id} item={item} />)}
    </div>
  );
}

export default function QuestionHighlights({ best, worst }: Props) {
  return (
    <>
      <div className={s.sectionHead}>
        <h2 className={s.sectionLabel}>Best &amp; worst questions</h2>
      </div>
      {best.length === 0 && worst.length === 0 ? (
        <p className={s.empty}>Not enough rated questions · needs ≥3 responses</p>
      ) : (
        <>
          <List label="Best rated" color="#7ED957" items={best} />
          <List label="Worst rated" color="#F26D6D" items={worst} />
        </>
      )}
    </>
  );
}
