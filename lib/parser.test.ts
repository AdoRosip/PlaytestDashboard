import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { exoviaConfig } from './games';
import { parseExcelFile } from './parser';

function workbookBuffer(sheets: Array<{ name: string; rows: Record<string, unknown>[] }>): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  for (const { name, rows } of sheets) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), name);
  }
  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

describe('parseExcelFile', () => {
  it('prefers an explicitly named response sheet over an earlier unknown sheet', () => {
    const result = parseExcelFile(workbookBuffer([
      { name: 'Read Me', rows: [{ Notes: 'not participant data' }] },
      {
        name: 'Tester Responses',
        rows: [{ 'Tester ID': 'P1', 'How much did you enjoy the game overall?': 4 }],
      },
    ]), 'responses.xlsx', exoviaConfig);

    expect(result.questions.map((q) => q.text)).toContain('How much did you enjoy the game overall?');
    expect(result.questions.map((q) => q.text)).not.toContain('Notes');
    expect(result.responses).toHaveLength(1);
  });

  it('honours a declared 1-10 scale even when the observed sample only reaches five', () => {
    const result = parseExcelFile(workbookBuffer([{
      name: 'Responses',
      rows: [1, 2, 3, 4, 5].map((score, index) => ({
        'Tester ID': `P${index}`,
        'Overall score (1-10)': score,
      })),
    }]), 'scale.xlsx', exoviaConfig);

    const question = result.questions.find((q) => q.text === 'Overall score (1-10)');
    expect(question?.type).toBe('rating_1_10');
    expect(question?.scaleMax).toBe(10);
  });

  it('keeps long fields assigned to an admin category out of player scoring', () => {
    const header = 'Admin notes about payment status and review follow-up for this participant';
    const result = parseExcelFile(workbookBuffer([{
      name: 'Responses',
      rows: [{ 'Tester ID': 'P1', [header]: 'Reviewed internally' }],
    }]), 'admin.xlsx', exoviaConfig);

    const question = result.questions.find((q) => q.text === header);
    expect(question?.categoryId).toBe('cat_15');
    expect(question?.type).toBe('internal_admin');
  });

  it('does not attach a response to an arbitrary duplicate registration contact', () => {
    const duplicateEmail = 'duplicate@example.com';
    const result = parseExcelFile(workbookBuffer([
      {
        name: 'Synced Registration',
        rows: [
          { 'Tester ID': 'A', Email: duplicateEmail, Country: 'Germany' },
          { 'Tester ID': 'B', Email: duplicateEmail, Country: 'France' },
        ],
      },
      {
        name: 'Responses',
        rows: [{ Email: duplicateEmail, 'How much did you enjoy the game overall?': 4 }],
      },
    ]), 'ambiguous.xlsx', exoviaConfig);

    expect(result.project.matchedTesters).toBe(0);
    expect(result.project.unmatchedTesters).toBe(1);
    expect(result.testers[0]?.segments).toEqual({});
    expect(result.warnings).toContain('Duplicate registration identifiers were ignored instead of being matched ambiguously.');
  });
});
