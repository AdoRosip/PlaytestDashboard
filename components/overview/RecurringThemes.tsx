'use client';
import { RefreshCw } from 'lucide-react';
import Link from '@/components/layout/ReportLink';
import type { Theme } from '@/lib/types';
import type { AnalysisStatus } from '@/lib/store';
import s from './overview.module.css';

const MAX_THEMES = 5;

interface Props {
  /** Every stored theme, before the cohort filter. */
  themes: Theme[];
  /** Themes with evidence in the current (possibly filtered) cohort. */
  visible: Theme[];
  status: AnalysisStatus;
  error: string | null;
  run: () => void;
  /** False when nobody wrote anything there could be a theme in. */
  hasInput: boolean;
}

/** The most frequent AI-found patterns across the open-ended answers. */
export default function RecurringThemes({ themes, visible, status, error, run, hasInput }: Props) {
  const top = [...visible].sort((a, b) => b.frequency - a.frequency).slice(0, MAX_THEMES);

  return (
    <>
      <div className={s.sectionHead}>
        <h2 className={s.sectionLabel}>
          Recurring feedback themes <span className={s.aiLabel}>AI</span>
        </h2>
        {top.length > 0 && <Link href="/themes" className={s.link}>View all →</Link>}
      </div>

      {!hasInput ? (
        <p className={s.empty}>Not enough open-ended answers to find themes</p>
      ) : themes.length === 0 && status === 'running' ? (
        <div aria-label="Finding recurring themes">
          {[0, 1, 2].map(i => (
            <div key={i} className={`${s.takeRow} groove-t-soft`}>
              <span className={s.skeleton} style={{ width: '50%' }} />
              <span className={s.skeleton} />
            </div>
          ))}
        </div>
      ) : themes.length === 0 && status === 'error' ? (
        <>
          <p className={s.error}>{error ?? 'Theme analysis failed'}</p>
          <button type="button" onClick={run} className={`${s.aiAction} mt-2`}>
            <RefreshCw className="w-3 h-3" aria-hidden="true" /> Retry
          </button>
        </>
      ) : themes.length === 0 ? (
        <p className={s.empty}>No recurring themes found</p>
      ) : top.length === 0 ? (
        <p className={s.empty}>No theme has evidence in this filtered cohort</p>
      ) : (
        top.map(t => (
          <div key={t.id} className={`${s.takeRow} groove-t-soft`}>
            <p className={s.takeTitle}>{t.label}</p>
            {t.summary && <p className={`${s.takeDetail} ${s.clamp2}`} title={t.summary}>{t.summary}</p>}
            <Link href={`/themes?theme=${encodeURIComponent(t.id)}`} className={`${s.themeMeta} ${s.themeSource}`}>
              {t.frequency} {t.frequency === 1 ? 'response' : 'responses'} · view sources →
            </Link>
          </div>
        ))
      )}
    </>
  );
}
