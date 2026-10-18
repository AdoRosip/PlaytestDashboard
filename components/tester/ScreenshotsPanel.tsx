'use client';
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react';
import type { TesterFile } from '@/lib/types';
import { profileDate, profileText, type screenshotGroups } from '@/lib/dossier';
import s from './TesterProfile.module.css';

type Groups = ReturnType<typeof screenshotGroups>;
function title(file: TesterFile, index: number) { return profileText(file.title || file.name || `Screenshot ${index + 1}`); }

function Shot({ file, alt, className }: { file: TesterFile; alt: string; className?: string }) {
  const [failed, setFailed] = useState(!file.url);
  if (failed) return <div className={`${s.shotError} ${className ?? ''}`}><p>This image can&apos;t be displayed</p></div>;
  // Signed storage URLs expire, so they must not go through the Next image cache.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={className} src={file.url} alt={alt} loading="lazy" onError={() => setFailed(true)} />;
}

/** Full-size viewer. A native modal dialog sits in the top layer, above the profile dialog. */
function Viewer({ files, index, onIndex, onClose }: { files: TesterFile[]; index: number; onIndex: (index: number) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    el.showModal();
    return () => el.close();
  }, []);
  const file = files[index];
  const step = (delta: number) => onIndex((index + delta + files.length) % files.length);
  const uploaded = profileDate(file.uploadedAt);
  return <dialog ref={dialog} className={s.viewer} aria-label={title(file, index)} onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}
    onKeyDown={event => {
      if (files.length < 2 || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault(); step(event.key === 'ArrowRight' ? 1 : -1);
    }}>
    <div className={s.viewerHead}>
      <div className={s.viewerTitle}><h2 className={s.truncate}>{title(file, index)}</h2>
        <p className={`${s.subline} ${s.truncate}`}>{[files.length > 1 ? `${index + 1} / ${files.length}` : '', uploaded].filter(Boolean).join(' · ')}</p></div>
      {file.url && <a className={s.button} href={file.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} />Open original</a>}
      <button className={s.close} onClick={onClose} aria-label="Close screenshot" autoFocus><X size={18} /></button>
    </div>
    <div className={s.viewerStage}>
      {files.length > 1 && <button className={`${s.close} ${s.viewerStep}`} onClick={() => step(-1)} aria-label="Previous screenshot"><ChevronLeft size={20} /></button>}
      <Shot key={file.id} file={file} alt={title(file, index)} className={s.viewerImage} />
      {files.length > 1 && <button className={`${s.close} ${s.viewerStep}`} onClick={() => step(1)} aria-label="Next screenshot"><ChevronRight size={20} /></button>}
    </div>
  </dialog>;
}

export default function ScreenshotsPanel({ groups }: { groups: Groups }) {
  const [open, setOpen] = useState<number>();
  // One grid, still in questionnaire order; the File question's text adds nothing here.
  const files = groups.flatMap(g => g.files);
  if (!files.length) return <p className={s.empty}>No screenshots uploaded.</p>;
  return <div className={s.shotGroups}>
    <div className={s.shotGrid}>{files.map((file, i) => <button key={file.id} className={s.shot} onClick={() => setOpen(i)} aria-label={`View ${title(file, i)}`}>
      <Shot file={file} alt="" />
    </button>)}</div>
    {open !== undefined && <Viewer files={files} index={open} onIndex={setOpen} onClose={() => setOpen(undefined)} />}
  </div>;
}
