import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parsePlaylytix, parseTypeOfGamer, mergeRegistry } from './registryImport';

/** Build an .xlsx ArrayBuffer from an array-of-objects. */
function workbook(rows: Record<string, unknown>[]): ArrayBuffer {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Form Responses 1');
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return out as ArrayBuffer;
}

const PLAYLYTIX_HEADERS = {
  ID: '', Timestamp: '', 'Email Address': '', 'What is your age?': '',
  'How do you describe your gender?': '', 'Which country do you primarily live in?': '',
  GPU: '', RAM: '', 'What is your exact Discord username?': '',
};

function playlytixRow(over: Record<string, unknown>): Record<string, unknown> {
  return { ...PLAYLYTIX_HEADERS, ...over };
}

describe('parsePlaylytix', () => {
  it('drops empty padding rows and keeps only rows with an email', () => {
    const buf = workbook([
      playlytixRow({ ID: 1, 'Email Address': 'a@x.com', 'What is your age?': '18 - 24' }),
      playlytixRow({}), // empty padding
      playlytixRow({ ID: 2, 'Email Address': 'b@x.com' }),
    ]);
    const recs = parsePlaylytix(buf);
    expect(recs).toHaveLength(2);
    expect(recs.map((r) => r.email).sort()).toEqual(['a@x.com', 'b@x.com']);
  });

  it('normalizes email and dedupes by email, keeping the latest timestamp', () => {
    const buf = workbook([
      playlytixRow({ ID: 5, Timestamp: '2026-01-01T00:00:00Z', 'Email Address': 'Dup@X.com', 'What is your age?': '18 - 24' }),
      playlytixRow({ ID: 6, Timestamp: '2026-06-01T00:00:00Z', 'Email Address': 'dup@x.com', 'What is your age?': '25 - 34' }),
    ]);
    const recs = parsePlaylytix(buf);
    expect(recs).toHaveLength(1);
    expect(recs[0].email).toBe('dup@x.com');
    expect(recs[0].playlytixId).toBe(6); // later timestamp wins
    expect(recs[0].segments.age_group).toBe('25 - 34');
  });

  it('captures segments and a hardware tier', () => {
    const buf = workbook([
      playlytixRow({ ID: 1, 'Email Address': 'a@x.com', 'Which country do you primarily live in?': 'Italy', GPU: 'RTX 4090', RAM: '32 GB' }),
    ]);
    const [rec] = parsePlaylytix(buf);
    expect(rec.segments.country).toBe('Italy');
    expect(rec.segments.hardware_tier).toBe('High');
    expect(rec.gpu).toBe('RTX 4090');
  });
});

describe('mergeRegistry', () => {
  it('joins genres/playstyles from Type of Gamer by email', () => {
    const playlytix = parsePlaylytix(workbook([
      playlytixRow({ ID: 1, 'Email Address': 'a@x.com' }),
      playlytixRow({ ID: 2, 'Email Address': 'b@x.com' }),
    ]));
    const gamerBuf = workbook([
      { 'Email Address': 'A@x.com', 'What genres of games do you play most often?': 'RPG, Strategy', 'What are your preferred playstyles?': 'Single-player (Solo)' },
    ]);
    const gamer = parseTypeOfGamer(gamerBuf);
    const merged = mergeRegistry(playlytix, gamer);

    const a = merged.find((r) => r.email === 'a@x.com')!;
    const b = merged.find((r) => r.email === 'b@x.com')!;
    expect(a.segments.genres).toBe('RPG, Strategy');
    expect(a.segments.playstyles).toBe('Single-player (Solo)');
    expect(b.segments.genres).toBeUndefined();
  });
});
