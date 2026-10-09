'use client';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import logo from '@/assets/LOGO_noBG_noGlow.png';
import styles from './PortalLoader.module.css';

const STEPS = ['Connecting to Portal', 'Fetching responses', 'Reading Steam libraries', 'Preparing your analysis'];
const STEP_MS = 1200;

export type LoadState = { testName?: string; done?: boolean; failed?: string };

/**
 * Full-screen progress shown while a Portal test loads. The step labels are
 * cosmetic and advance on a timer, holding on the last step until the real
 * load completes or fails.
 */
export default function PortalLoader({ state, onRetry }: { state: LoadState; onRetry: () => void }) {
  const [step, setStep] = useState(0);
  const stopped = Boolean(state.done || state.failed);
  useEffect(() => {
    if (stopped) return;
    const timer = setInterval(() => setStep(s => Math.min(s + 1, STEPS.length - 1)), STEP_MS);
    return () => clearInterval(timer);
  }, [stopped]);
  const total = STEPS.length;
  const progress = state.done ? 1 : (step + 0.5) / total;
  const label = state.failed ? 'Couldn’t load your test' : state.done ? 'Opening dashboard' : STEPS[step];
  return <div className={styles.screen}>
    <div className={styles.logo}>
      <div className={styles.glow} aria-hidden />
      <Image src={logo} alt="" loading="eager" className={styles.image} />
    </div>
    <div className={styles.text}>
      <h1 className={styles.title}>Loading your test</h1>
      <p className={styles.subtitle}>{state.failed ?? state.testName}</p>
    </div>
    <div className={styles.progress}>
      <div className={styles.track} role="progressbar" aria-label="Loading progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
        <div className={styles.fill} style={{ width: `${progress * 100}%` }} />
      </div>
      <div className={styles.status}>
        <span className={styles.label} aria-live="polite">
          {label}
          {state.failed && <button type="button" onClick={onRetry} className={styles.retry}>Try again</button>}
        </span>
        <span className={styles.counter}>{state.done ? total : step + 1} / {total}</span>
      </div>
    </div>
  </div>;
}
