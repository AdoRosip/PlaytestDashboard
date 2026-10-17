import OpenAI from 'openai';
import { requireDashboardAuth } from '@/lib/server/requestAuth';
import { formatCueTime } from '@/lib/playlytix/transcripts';
import type { TranscriptCue } from '@/lib/types';

export interface TranscriptSummaryInput {
  gameName: string;
  cues: TranscriptCue[];
}

export interface TranscriptMoment {
  /** Seconds from the start of the video. */
  time: number;
  note: string;
  tone: 'positive' | 'negative' | 'neutral';
}

export interface TranscriptSummaryResult {
  summary: string;
  moments: TranscriptMoment[];
}

// ~50k tokens of transcript: a five-hour session fits once merged into blocks.
const MAX_CHARS = 200_000;
const BLOCK_SECONDS = 30;

/** Merge cues into ~30s blocks so timestamps stay useful without one per line. */
function transcriptText(cues: TranscriptCue[]): string {
  const blocks: { start: number; text: string[] }[] = [];
  for (const cue of cues) {
    const last = blocks.at(-1);
    if (last && cue.start - last.start < BLOCK_SECONDS) last.text.push(cue.text);
    else blocks.push({ start: cue.start, text: [cue.text] });
  }
  const full = blocks.map(b => `[${formatCueTime(b.start)}] ${b.text.join(' ')}`);
  let total = 0;
  const kept: string[] = [];
  for (const line of full) {
    total += line.length + 1;
    if (total > MAX_CHARS) { kept.push('[…transcript truncated…]'); break; }
    kept.push(line);
  }
  return kept.join('\n');
}

export async function POST(req: Request) {
  const authError = requireDashboardAuth(req);
  if (authError) return authError;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'OPENAI_API_KEY not set in .env.local' }, { status: 500 });
  }

  const { gameName, cues = [] } = ((await req.json()) ?? {}) as TranscriptSummaryInput;
  const valid = cues.filter(c => Number.isFinite(c?.start) && typeof c?.text === 'string' && c.text.trim());
  if (valid.length === 0) {
    return Response.json({ summary: 'The transcript is empty.', moments: [] } satisfies TranscriptSummaryResult);
  }
  const lastSecond = Math.max(...valid.map(c => c.end ?? c.start));

  const prompt = `You are a senior games user researcher reviewing a playtest session recording of "${gameName || 'this game'}".
Below is the transcript of the tester thinking aloud while playing, in time-stamped blocks ([mm:ss] or [h:mm:ss] from the start of the video).

TRANSCRIPT:
${transcriptText(valid)}

Return a JSON object with exactly this structure:
{
  "summary": "3 to 5 sentences: how the session went, what the tester enjoyed, where they struggled or got frustrated, and anything the developer should look at",
  "moments": [ { "time": "mm:ss or h:mm:ss taken from the block where it happens", "note": "one short sentence on what happens and why it matters", "tone": "positive | negative | neutral" } ]
}

Rules:
- 3 to 8 moments, in chronological order, favouring confusion, frustration, bugs, delight and quotable reactions over routine narration.
- Ground everything in the transcript; never invent events. Speech-to-text may contain errors, so read for meaning.
- If the tester speaks a language other than English, still answer in English.
- Keep every field concise.`;

  const openai = new OpenAI({ apiKey });

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });
    const parsed = JSON.parse(completion.choices[0].message.content ?? '{}') as {
      summary?: unknown;
      moments?: { time?: unknown; note?: unknown; tone?: unknown }[];
    };
    const moments: TranscriptMoment[] = (Array.isArray(parsed.moments) ? parsed.moments : []).flatMap(m => {
      const time = typeof m.time === 'string' ? parseClock(m.time) : typeof m.time === 'number' ? m.time : null;
      if (time === null || time < 0 || time > lastSecond || typeof m.note !== 'string') return [];
      const tone = m.tone === 'positive' || m.tone === 'negative' ? m.tone : 'neutral';
      return [{ time, note: m.note, tone }];
    });
    return Response.json({
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      moments: moments.sort((a, b) => a.time - b.time),
    } satisfies TranscriptSummaryResult);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'OpenAI request failed';
    return Response.json({ error: message }, { status: 500 });
  }
}

/** "12:34" / "1:02:05" → seconds; null when it isn't a clock time. */
function parseClock(value: string): number | null {
  const parts = value.trim().replace(/^\[|\]$/g, '').split(':');
  if (parts.length < 2 || parts.length > 3 || !parts.every(p => /^\d+$/.test(p))) return null;
  return parts.map(Number).reduce((total, part) => total * 60 + part, 0);
}
