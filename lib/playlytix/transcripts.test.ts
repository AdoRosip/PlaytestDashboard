import { describe, expect, it } from 'vitest';
import { formatCueTime, mapTranscripts, toVtt } from './transcripts';

describe('transcripts', () => {
  it('rejects a payload for a different submission', () => {
    expect(() => mapTranscripts({ responseId: 1, transcripts: [] }, 2)).toThrow('Unexpected submission');
  });
  it('drops malformed and empty cues instead of failing the transcript', () => {
    const { transcripts } = mapTranscripts({ responseId: 5, transcripts: [{ fileId: 3, cues: [
      { start: 4, end: 2, text: 'ends before it starts' }, { start: 1, end: 2, text: '  <b> </b> ' }, null, { start: 0, end: 1, text: 'ok' },
    ] }] }, 5);
    expect(transcripts[0].cues).toEqual([{ start: 0, end: 1, text: 'ok' }]);
  });
  it('formats clock times', () => {
    expect(formatCueTime(12.48)).toBe('0:12');
    expect(formatCueTime(754.2)).toBe('12:34');
    expect(formatCueTime(3725)).toBe('1:02:05');
  });
  it('builds WebVTT that a cue cannot break', () => {
    expect(toVtt([{ start: 12.48, end: 3725.5, text: 'a --> b' }])).toBe('WEBVTT\n\n00:00:12.480 --> 01:02:05.500\na → b\n');
  });
});
