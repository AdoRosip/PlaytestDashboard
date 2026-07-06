'use client';
import { useState } from 'react';
import { Database, Upload, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { parsePlaylytix, parseTypeOfGamer, mergeRegistry } from '@/lib/registryImport';
import type { RegistryRecord, ImportResult } from '@/lib/registry';

type Phase = 'idle' | 'built' | 'importing' | 'done' | 'error';

export default function RegistryPage() {
  const [playlytixFile, setPlaylytixFile] = useState<File | null>(null);
  const [gamerFile, setGamerFile] = useState<File | null>(null);
  const [records, setRecords] = useState<RegistryRecord[] | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const withGenres = records?.filter((r) => r.segments.genres).length ?? 0;
  const withId = records?.filter((r) => r.playlytixId != null).length ?? 0;

  async function build() {
    if (!playlytixFile) return;
    setError('');
    setImportResult(null);
    try {
      const playlytix = parsePlaylytix(await playlytixFile.arrayBuffer());
      const gamer = gamerFile ? parseTypeOfGamer(await gamerFile.arrayBuffer()) : new Map();
      const merged = mergeRegistry(playlytix, gamer);
      setRecords(merged);
      setPhase('built');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to parse files.');
      setPhase('error');
    }
  }

  async function runImport() {
    if (!records) return;
    setPhase('importing');
    setError('');
    try {
      const res = await fetch('/api/testers/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setImportResult(body as ImportResult);
      setPhase('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed.');
      setPhase('error');
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <div className="flex items-center gap-3 mb-2">
        <Database className="w-6 h-6 text-indigo-400" />
        <h1 className="text-2xl font-bold text-white">Tester Registry</h1>
      </div>
      <p className="text-sm text-slate-400 mb-8">
        The master, cross-game tester list. Upload the Playlytix registration export
        (required) and, optionally, the &ldquo;Type of Gamer&rdquo; export to enrich
        profiles with genres and playstyles. Records are de-duplicated by email and
        stored securely server-side (Supabase). This data never reaches the browser
        except when linking feedback you upload.
      </p>

      {/* File pickers */}
      <div className="space-y-4">
        <FilePicker
          label="Playlytix registration (.xlsx) — required"
          file={playlytixFile}
          onChange={(f) => { setPlaylytixFile(f); setRecords(null); setPhase('idle'); }}
        />
        <FilePicker
          label="Type of Gamer (.xlsx) — optional"
          file={gamerFile}
          onChange={(f) => { setGamerFile(f); setRecords(null); setPhase('idle'); }}
        />
      </div>

      <button
        onClick={build}
        disabled={!playlytixFile}
        className="mt-6 w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
      >
        Build &amp; preview registry
      </button>

      {/* Preview */}
      {records && (
        <div className="mt-6 rounded-xl border border-slate-700 bg-slate-800/40 p-5">
          <div className="grid grid-cols-3 gap-4 text-center">
            <Stat label="Unique testers" value={records.length} />
            <Stat label="With Playlytix ID" value={withId} />
            <Stat label="With genres" value={withGenres} />
          </div>
          <button
            onClick={runImport}
            disabled={phase === 'importing'}
            className="mt-5 w-full py-3 rounded-xl bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            {phase === 'importing' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {phase === 'importing' ? 'Importing…' : `Import ${records.length} testers to registry`}
          </button>
        </div>
      )}

      {/* Result / errors */}
      {phase === 'done' && importResult && (
        <div className="mt-4 rounded-lg border border-green-500/30 bg-green-500/5 p-4 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-green-400" />
          <span className="text-sm text-green-300">
            Imported {importResult.upserted} of {importResult.total} testers into the registry.
          </span>
        </div>
      )}
      {error && (
        <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/5 p-4 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <span className="text-sm text-red-300">{error}</span>
        </div>
      )}
    </div>
  );
}

function FilePicker({ label, file, onChange }: { label: string; file: File | null; onChange: (f: File | null) => void }) {
  return (
    <label className="block cursor-pointer rounded-xl border border-dashed border-slate-700 bg-slate-800/30 hover:border-slate-500 px-4 py-3 transition-colors">
      <input
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-sm text-slate-200 mt-1 truncate">{file ? file.name : 'Click to choose a file'}</div>
    </label>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-xs text-slate-400 mt-1">{label}</div>
    </div>
  );
}
