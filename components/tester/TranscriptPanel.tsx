'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';
import type { TranscriptCue, VideoTranscriptRef } from '@/lib/types';
import { formatCueTime, type VideoTranscript } from '@/lib/playlytix/transcripts';
import type { TranscriptSummaryResult } from '@/app/api/transcript-summary/route';
import { useDashboardStore } from '@/lib/store';
import { useCachedAnalysis } from '@/lib/useCachedAnalysis';
import s from './TesterProfile.module.css';

// One request per submission covers all of its videos, so switching between
// them (or closing and reopening the dossier) doesn't refetch.
const loaded = new Map<string, Promise<VideoTranscript[]>>();

function loadTranscripts(ref: VideoTranscriptRef): Promise<VideoTranscript[]> {
  const key = `${ref.testId}:${ref.submissionId}`;
  let pending = loaded.get(key);
  if (!pending) {
    pending = (async () => {
      const session = await fetch('/api/portal/session', { cache: 'no-store' });
      if (!session.ok) throw new Error('Session expired. Reopen the report from the Portal.');
      const { sid } = await session.json() as { sid: string };
      const res = await fetch(`/api/portal/tests/${ref.testId}/responses/${ref.submissionId}/transcripts`, {
        cache: 'no-store', headers: { 'x-portal-session': sid },
      });
      const body = await res.json().catch(() => ({})) as { transcripts?: VideoTranscript[]; error?: string };
      if (!res.ok || !body.transcripts) throw new Error(body.error ?? `HTTP ${res.status}`);
      return body.transcripts;
    })();
    loaded.set(key, pending);
    pending.catch(() => loaded.delete(key));
  }
  return pending;
}

/** The selected video's cues: undefined while loading or when it has no transcript. */
export function useTranscript(ref?: VideoTranscriptRef) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; cues?: TranscriptCue[]; error?: string }>();
  const testId = ref?.testId, submissionId = ref?.submissionId, fileId = ref?.fileId;
  const key = ref ? `${testId}:${submissionId}:${fileId}:${attempt}` : undefined;

  useEffect(() => {
    if (!testId || !submissionId || !fileId) return;
    const current = `${testId}:${submissionId}:${fileId}:${attempt}`;
    let live = true;
    loadTranscripts({ testId, submissionId, fileId, cues: 0 }).then(
      list => { if (live) setResult({ key: current, cues: list.find(t => t.fileId === fileId)?.cues ?? [] }); },
      error => { if (live) setResult({ key: current, error: error instanceof Error ? error.message : 'Unable to load transcript' }); },
    );
    return () => { live = false; };
  }, [testId, submissionId, fileId, attempt]);

  const settled = result?.key === key ? result : undefined;
  return {
    cues: settled?.cues,
    error: settled?.error,
    loading: !!key && !settled,
    retry: () => setAttempt(n => n + 1),
  };
}

/** Index of the cue playing at `time`, or -1 between cues. */
function cueAt(cues: TranscriptCue[], time: number): number {
  let lo = 0, hi = cues.length - 1, found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid].start <= time) { found = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return found >= 0 && time < Math.max(cues[found].end, cues[found].start + 1) ? found : -1;
}

function Summary({ cueRef, cues, seek }: { cueRef: VideoTranscriptRef; cues: TranscriptCue[]; seek: (time: number) => void }) {
  const gameName = useDashboardStore(state => state.project?.gameName || state.project?.name || '');
  const fetcher = useCallback(async (): Promise<TranscriptSummaryResult> => {
    const res = await fetch('/api/transcript-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameName, cues }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
    return body as TranscriptSummaryResult;
  }, [gameName, cues]);
  // Each video is a separate paid request, so it only runs when asked for.
  const { data, loading, error, run } = useCachedAnalysis<TranscriptSummaryResult>({
    key: `transcript:${cueRef.testId}:${cueRef.submissionId}:${cueRef.fileId}`,
    signature: `${cues.length}:${cues.at(-1)?.end ?? 0}`,
    auto: false,
    fetcher,
  });

  return <div className={s.summary}>
    <div className={s.summaryHead}>
      <span className={s.summaryLabel}><Sparkles size={13} aria-hidden="true" /> AI summary</span>
      {!loading && <button type="button" className={s.summaryAction} onClick={run}>
        {data ? <><RefreshCw size={12} aria-hidden="true" /> Re-run</> : error ? 'Retry' : 'Summarise this session'}
      </button>}
    </div>
    {loading ? <p className={s.summaryText}>Reading {cues.length.toLocaleString('en-GB')} lines…</p>
      : error ? <p className={s.summaryError}>{error}</p>
      : data && <>
        <p className={s.summaryText}>{data.summary}</p>
        {data.moments.length > 0 && <ol className={s.moments}>
          {data.moments.map((m, i) => <li key={i}>
            <button type="button" className={s.moment} onClick={() => seek(m.time)}>
              <span className={`${s.cueTime} ${s.numeric}`}>{formatCueTime(m.time)}</span>
              <span className={s.tone} data-tone={m.tone} aria-hidden="true" />
              <span>{m.note}</span>
            </button>
          </li>)}
        </ol>}
      </>}
  </div>;
}

export default function TranscriptPanel({ cueRef, transcript, video }: {
  cueRef: VideoTranscriptRef;
  transcript: ReturnType<typeof useTranscript>;
  video: HTMLVideoElement | null;
}) {
  const { cues, error, loading, retry } = transcript;
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(-1);
  const list = useRef<HTMLDivElement>(null);
  const userScrolledAt = useRef(0);

  const visible = useMemo(() => {
    const all = (cues ?? []).map((cue, index) => ({ cue, index }));
    const q = query.trim().toLowerCase();
    return q ? all.filter(({ cue }) => cue.text.toLowerCase().includes(q)) : all;
  }, [cues, query]);

  // Follow playback: highlight the current line.
  useEffect(() => {
    if (!video || !cues?.length) return;
    const update = () => setActive(cueAt(cues, video.currentTime));
    update();
    video.addEventListener('timeupdate', update);
    video.addEventListener('seeked', update);
    return () => { video.removeEventListener('timeupdate', update); video.removeEventListener('seeked', update); };
  }, [video, cues]);

  // …and keep it in view while playing, unless the user is scrolling the list themselves.
  useEffect(() => {
    if (active < 0 || !video || video.paused || query || Date.now() - userScrolledAt.current < 5000) return;
    const box = list.current;
    const row = box?.querySelector<HTMLElement>(`[data-cue="${active}"]`);
    if (!box || !row) return;
    const top = row.offsetTop - box.offsetTop;
    if (top < box.scrollTop || top + row.offsetHeight > box.scrollTop + box.clientHeight) {
      box.scrollTo({ top: top - box.clientHeight / 3 });
    }
  }, [active, video, query]);

  // Seeking goes through a ref: the element itself arrives as a prop.
  const player = useRef(video);
  useEffect(() => { player.current = video; }, [video]);
  const seek = useCallback((time: number) => {
    const el = player.current;
    if (!el) return;
    el.currentTime = time;
    void el.play().catch(() => { /* autoplay blocked: the seek still lands */ });
  }, []);

  return <section className={s.transcript} aria-label="Transcript">
    <div className={s.transcriptHead}>
      <h3 className={s.transcriptTitle}>Transcript{cues && <span className={s.count}>{cues.length.toLocaleString('en-GB')} lines</span>}</h3>
      {!!cues?.length && <input type="search" className={s.transcriptSearch} placeholder="Search transcript" aria-label="Search transcript" value={query} onChange={event => setQuery(event.target.value)} />}
    </div>

    {loading ? <p className={s.micro}>Loading transcript…</p>
      : error ? <p className={s.summaryError}>{error} <button type="button" className={s.summaryAction} onClick={retry}>Retry</button></p>
      : !cues?.length ? <p className={s.micro}>No transcript lines for this video.</p>
      : <>
        <Summary cueRef={cueRef} cues={cues} seek={seek} />
        {query && <p className={s.micro}>{visible.length} {visible.length === 1 ? 'match' : 'matches'}</p>}
        <div ref={list} className={s.cueList} onWheel={() => { userScrolledAt.current = Date.now(); }} onTouchMove={() => { userScrolledAt.current = Date.now(); }}>
          {visible.map(({ cue, index }) => <button key={index} type="button" data-cue={index} className={s.cue} aria-current={index === active || undefined} disabled={!video} onClick={() => seek(cue.start)}>
            <span className={`${s.cueTime} ${s.numeric}`}>{formatCueTime(cue.start)}</span>
            <span>{cue.text}</span>
          </button>)}
        </div>
      </>}
  </section>;
}
