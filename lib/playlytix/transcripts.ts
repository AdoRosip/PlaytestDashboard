import type { TranscriptCue } from '../types';
import { array, id, object } from './mapper';

export interface VideoTranscript {
  fileId: number;
  cues: TranscriptCue[];
}

/**
 * Browser DTO for `GET /tests/:id/responses/:responseId/transcripts`: only the
 * file id and timed lines; file names and anything else upstream are dropped.
 * A malformed cue is skipped rather than failing the whole transcript.
 */
export function mapTranscripts(input: unknown, responseId: number): { transcripts: VideoTranscript[] } {
  const data = object(input);
  if (id(data.responseId) !== responseId) throw new Error('Unexpected submission');
  const transcripts = array(data.transcripts).map(object).map(t => ({
    fileId: id(t.fileId),
    cues: array(t.cues).flatMap(raw => {
      if (!raw || typeof raw !== 'object') return [];
      const { start, end, text } = raw as Record<string, unknown>;
      if (typeof start !== 'number' || typeof end !== 'number' || typeof text !== 'string') return [];
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start) return [];
      // SRT allows <i>/<b>/<font> styling tags; the dashboard shows plain text.
      const plain = text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
      return plain ? [{ start, end, text: plain }] : [];
    }).sort((a, b) => a.start - b.start),
  }));
  return { transcripts };
}

/** 754.2 → "12:34", 3725 → "1:02:05". */
export function formatCueTime(seconds: number): string {
  const s = Math.floor(seconds);
  const mm = String(Math.floor(s % 3600 / 60)).padStart(s >= 3600 ? 2 : 1, '0');
  const ss = String(s % 60).padStart(2, '0');
  return s >= 3600 ? `${Math.floor(s / 3600)}:${mm}:${ss}` : `${mm}:${ss}`;
}

function vttTime(seconds: number): string {
  const ms = Math.round(seconds * 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)}.${pad(ms % 1000, 3)}`;
}

/** WebVTT for a `<track>`, so the player can show the lines as captions. */
export function toVtt(cues: TranscriptCue[]): string {
  // "-->" inside a cue's text would end the cue's timing line early.
  return `WEBVTT\n\n${cues.map(c => `${vttTime(c.start)} --> ${vttTime(c.end)}\n${c.text.replace(/-->/g, '→')}`).join('\n\n')}\n`;
}
