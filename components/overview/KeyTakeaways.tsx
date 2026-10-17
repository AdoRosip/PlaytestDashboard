'use client';
import type { ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import type { OverviewInsight, OverviewInsightsResult } from '@/app/api/overview-insights/route';
import s from './overview.module.css';

const GOOD = '#7ED957';
const WARN = '#E8C547';
const AI = '#00FFFF';

interface Props {
  data: OverviewInsightsResult | null;
  loading: boolean;
  error: string | null;
  run: () => void;
  /** False when the form has nothing the model could analyse. */
  hasInput: boolean;
  filtersActive: boolean;
}

function InsightRow({ item, color }: { item: OverviewInsight; color: string }) {
  return (
    <div className={`${s.takeRow} groove-t-soft`}>
      <p className={s.takeTitle}>{item.title}</p>
      <p className={s.takeDetail}>{item.detail}</p>
      {item.quote && <p className={s.takeQuote} style={{ color }}>&ldquo;{item.quote}&rdquo;</p>}
    </div>
  );
}

function Column({ label, color, children }: { label: string; color: string; children: ReactNode }) {
  return (
    <div className={`${s.takeCol} groove-cell`}>
      <div className={s.takeLabel} style={{ color }}>{label}</div>
      {children}
    </div>
  );
}

function Skeleton() {
  return (
    <div aria-label="Generating key takeaways" className={s.takeCols}>
      {[GOOD, WARN, AI].map((color, i) => (
        <Column key={i} label={['Strengths', 'Concerns', 'Recommendations'][i]} color={color}>
          {[0, 1, 2].map(j => (
            <div key={j} className={`${s.takeRow} groove-t-soft`}>
              <span className={s.skeleton} style={{ width: '55%' }} />
              <span className={s.skeleton} />
              <span className={s.skeleton} style={{ width: '70%' }} />
            </div>
          ))}
        </Column>
      ))}
    </div>
  );
}

/**
 * AI summary of the whole playtest: what landed, what didn't, and what to do
 * about it. Every point is grounded in the testers' own answers.
 */
export default function KeyTakeaways({ data, loading, error, run, hasInput, filtersActive }: Props) {
  return (
    <section className={`${s.takeaways} groove-b`}>
      <div className={s.sectionHead}>
        <h2 className={s.sectionLabel}>
          Key takeaways <span className={s.aiLabel}>AI</span>
        </h2>
        {hasInput && !loading && (data || error || filtersActive) && (
          <button type="button" onClick={run} className={s.aiAction}>
            <RefreshCw className="w-3 h-3" aria-hidden="true" />
            {data ? 'Re-run' : error ? 'Retry' : 'Analyse this cohort'}
          </button>
        )}
      </div>

      {!hasInput ? (
        <p className={s.empty}>Not enough responses to analyse yet</p>
      ) : loading ? (
        <Skeleton />
      ) : error ? (
        <p className={s.error}>{error}</p>
      ) : !data ? (
        // Only reachable with filters on: the full set analyses itself on load,
        // a filtered cohort is a separate paid request the user asks for.
        <p className={s.empty}>Not generated for this filtered cohort yet</p>
      ) : (
        <div className={s.takeCols}>
          <Column label="Strengths" color={GOOD}>
            {data.strengths.length === 0
              ? <p className={s.empty}>None identified</p>
              : data.strengths.map((item, i) => <InsightRow key={i} item={item} color={GOOD} />)}
          </Column>
          <Column label="Concerns" color={WARN}>
            {data.concerns.length === 0
              ? <p className={s.empty}>None identified</p>
              : data.concerns.map((item, i) => <InsightRow key={i} item={item} color={WARN} />)}
          </Column>
          <Column label="Recommendations" color={AI}>
            {data.recommendations.length === 0
              ? <p className={s.empty}>None returned</p>
              : data.recommendations.map((r, i) => (
                  <div key={i} className={`${s.takeRow} groove-t-soft`}>
                    <p className={s.takeTitle}>{r.area}</p>
                    <p className={s.takeDetail}>{r.problem}</p>
                    <p className={s.takeFix}>→ {r.recommendation}</p>
                  </div>
                ))}
          </Column>
        </div>
      )}
    </section>
  );
}
