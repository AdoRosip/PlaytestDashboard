'use client';
import { useEffect, useRef, useState } from 'react';
import type { TesterVideo } from '@/lib/types';
import { profileAnswers, profileDate, profileText } from '@/lib/dossier';
import s from './TesterProfile.module.css';

export type VideoMetadata = { durationSec?: number; width?: number; height?: number; thumbnail?: string };
function readMetadata(video: HTMLVideoElement): VideoMetadata {
  return { durationSec: Number.isFinite(video.duration) ? video.duration : undefined, width: video.videoWidth || undefined, height: video.videoHeight || undefined };
}
function duration(seconds?: number) {
  if (seconds === undefined) return undefined;
  const value = Math.floor(seconds);
  return value >= 3600 ? `${Math.floor(value / 3600)}:${String(Math.floor(value % 3600 / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}` : `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}
function title(file: TesterVideo, index: number) { return profileText(file.title || file.name || `Video ${index + 1}`); }

function Thumbnail({ file, metadata, onMetadata }: { file: TesterVideo; metadata?: VideoMetadata; onMetadata: (id: string, data: VideoMetadata) => void }) {
  const callback = useRef(onMetadata);
  useEffect(() => { callback.current = onMetadata; }, [onMetadata]);
  const [failedImage, setFailedImage] = useState(false);
  useEffect(() => {
    if (!file.url) return;
    const video = document.createElement('video');
    video.preload = 'metadata'; video.muted = true; video.playsInline = true;
    // Canvas preview needs CORS; the actual player does not.
    video.crossOrigin = 'anonymous';
    let stopped = false;
    const cleanup = () => { stopped = true; video.removeAttribute('src'); video.load(); };
    const timeout = setTimeout(cleanup, 15000);
    video.onloadedmetadata = () => {
      if (stopped) return;
      callback.current(file.id, readMetadata(video));
      if (file.thumbnailUrl && !failedImage) { clearTimeout(timeout); cleanup(); return; }
      video.currentTime = Math.min(1, Number.isFinite(video.duration) ? video.duration / 2 : 1);
    };
    video.onseeked = () => {
      if (stopped) return;
      try {
        const canvas = document.createElement('canvas'); canvas.width = 192; canvas.height = 108;
        canvas.getContext('2d')?.drawImage(video, 0, 0, 192, 108);
        callback.current(file.id, { thumbnail: canvas.toDataURL('image/jpeg') });
      } catch { /* Storage CORS or unsupported codecs: retain the placeholder. */ }
      clearTimeout(timeout); cleanup();
    };
    video.onerror = () => { clearTimeout(timeout); cleanup(); };
    video.src = file.url;
    return () => { clearTimeout(timeout); video.onloadedmetadata = null; video.onseeked = null; video.onerror = null; cleanup(); };
  }, [file.id, file.url, file.thumbnailUrl, failedImage]);
  const src = !failedImage && file.thumbnailUrl || metadata?.thumbnail;
  return <div className={`${s.thumbnail} ${s.stripes}`}>
    {/* Temporary signed media and canvas frames must not enter an image cache. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {src && <img src={src} alt="" onError={() => setFailedImage(true)} />}
    {duration(file.durationSec ?? metadata?.durationSec) && <span className={`${s.duration} ${s.numeric}`}>{duration(file.durationSec ?? metadata?.durationSec)}</span>}
  </div>;
}

function Player({ file, name, onMetadata }: { file: TesterVideo; name: string; onMetadata: (id: string, data: VideoMetadata) => void }) {
  const [error, setError] = useState(!file.url);
  const [loaded, setLoaded] = useState(false);
  return <div className={`${s.player} ${loaded ? '' : s.stripes}`}>
    {!error && <video controls preload="metadata" playsInline src={file.url} aria-label={name} onError={() => setError(true)} onLoadedMetadata={event => { setLoaded(true); onMetadata(file.id, readMetadata(event.currentTarget)); }} />}
    {error && <div className={s.playerError}><p>This video can&apos;t be played in the browser</p>{file.url && <a href={file.url} download target="_blank" rel="noreferrer">Download</a>}</div>}
  </div>;
}

export default function VideosPanel({ files, answers, metadata, onMetadata, onLinkedAnswer }: {
  files: TesterVideo[]; answers: ReturnType<typeof profileAnswers>; metadata: Record<string, VideoMetadata>;
  onMetadata: (id: string, data: VideoMetadata) => void; onLinkedAnswer: (id: string) => void;
}) {
  const [selected, setSelected] = useState(0);
  const [focused, setFocused] = useState(0);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  if (!files.length) return <p className={s.empty}>No recordings uploaded.</p>;
  const file = files[selected] ?? files[0];
  const meta = metadata[file.id];
  const width = file.width ?? meta?.width, height = file.height ?? meta?.height;
  const uploaded = profileDate(file.uploadedAt);
  const linked = answers.find(a => a.response.id === file.responseId || a.q.id === file.questionId);
  // TODO(spec): Portal uploads point at File questions with no answers[] entry;
  // show a Linked answer action only when an actual response exists.
  return <div className={s.videoGrid}><div>
    <Player key={file.id} file={file} name={title(file, selected)} onMetadata={onMetadata} />
    <h2 className={s.videoTitle}>{title(file, selected)}</h2>
    <p className={`${s.videoMeta} ${s.numeric}`}>{[uploaded ? `Uploaded ${uploaded}` : '', duration(file.durationSec ?? meta?.durationSec), width && height ? `${width} × ${height}` : ''].filter(Boolean).join(' · ')}</p>
    {linked && <button className={s.linked} onClick={() => onLinkedAnswer(linked.response.id)}><div className={s.micro}>Linked answer</div><div className={`${s.linkedText} ${s.truncate}`}>Q{linked.index} · &quot;{profileText(linked.response.rawAnswer)}&quot;</div></button>}
  </div><div className={s.playlist} role="listbox" aria-label="Recordings" aria-orientation="vertical">
    {files.map((item, i) => <button key={item.id} ref={el => { items.current[i] = el; }} role="option" aria-selected={i === selected} aria-label={title(item, i)} className={s.playlistItem} tabIndex={focused === i ? 0 : -1} onFocus={() => setFocused(i)} onClick={() => setSelected(i)} onKeyDown={event => {
      if (['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? files.length - 1 : (i + (['ArrowDown', 'ArrowRight'].includes(event.key) ? 1 : files.length - 1)) % files.length;
        setFocused(next); items.current[next]?.focus();
      } else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(i); }
    }}><Thumbnail file={item} metadata={metadata[item.id]} onMetadata={onMetadata} /><div className={s.playlistText}><div className={s.playlistTitle}>{title(item, i)}</div><div className={s.playlistSub}>{selected === i ? 'Playing now' : profileDate(item.uploadedAt)}</div></div></button>)}
  </div></div>;
}
