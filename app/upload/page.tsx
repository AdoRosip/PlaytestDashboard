'use client';
import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2 } from 'lucide-react';
import { parseExcelFile } from '@/lib/parser';
import { useDashboardStore } from '@/lib/store';
import CompanyLogo from '@/components/brand/CompanyLogo';

export default function UploadPage() {
  const router = useRouter();
  const loadFromExcel = useDashboardStore((s) => s.loadFromExcel);
  const loadMockData = useDashboardStore((s) => s.loadMockData);

  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<'idle' | 'parsing' | 'done' | 'error'>('idle');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState('');

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      setError('Please upload an Excel file (.xlsx or .xls)');
      setStatus('error');
      return;
    }

    setStatus('parsing');
    setError('');

    try {
      const buffer = await file.arrayBuffer();
      const result = parseExcelFile(buffer, file.name);
      setWarnings(result.warnings);
      loadFromExcel(result);
      setStatus('done');
      setTimeout(() => router.push('/overview'), 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to parse file');
      setStatus('error');
    }
  }, [loadFromExcel, router]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div className="min-h-screen bg-[#0b0f19] flex flex-col items-center justify-center px-4">
      {/* Header */}
      <div className="flex flex-col items-center gap-3 mb-10 text-center">
        <CompanyLogo glow className="w-24" priority />
        <div>
          <div className="text-lg font-semibold text-white">Playlytix</div>
          <div className="text-xs text-slate-400">Interactive feedback analysis for game studios</div>
        </div>
      </div>

      <div className="w-full max-w-lg">
        <h1 className="text-2xl font-bold text-white text-center mb-2">Upload your playtest data</h1>
        <p className="text-sm text-slate-400 text-center mb-8">
          Upload the Excel file exported from Google Forms. We&apos;ll parse the Responses and Synced Registration sheets automatically.
        </p>

        {/* Drop zone */}
        <label
          className={`
            relative flex flex-col items-center justify-center w-full h-52 rounded-2xl border-2 border-dashed cursor-pointer transition-all
            ${dragging
              ? 'border-indigo-400 bg-indigo-500/10'
              : 'border-slate-700 bg-slate-800/30 hover:border-slate-500 hover:bg-slate-800/50'}
            ${status === 'done' ? 'border-green-500/50 bg-green-500/5' : ''}
            ${status === 'error' ? 'border-red-500/50 bg-red-500/5' : ''}
          `}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <input
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={onFileChange}
          />

          {status === 'idle' && (
            <>
              <div className="w-12 h-12 rounded-full bg-slate-700/60 flex items-center justify-center mb-3">
                <Upload className="w-6 h-6 text-slate-300" />
              </div>
              <div className="text-sm font-medium text-slate-200">Drop your Excel file here</div>
              <div className="text-xs text-slate-500 mt-1">or click to browse</div>
              <div className="text-xs text-slate-600 mt-3">.xlsx · .xls</div>
            </>
          )}

          {status === 'parsing' && (
            <>
              <div className="w-12 h-12 rounded-full bg-indigo-500/20 flex items-center justify-center mb-3 animate-pulse">
                <FileSpreadsheet className="w-6 h-6 text-indigo-400" />
              </div>
              <div className="text-sm text-slate-300">Parsing your file…</div>
              <div className="text-xs text-slate-500 mt-1">Detecting sheets, questions, and tester profiles</div>
            </>
          )}

          {status === 'done' && (
            <>
              <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mb-3">
                <CheckCircle2 className="w-6 h-6 text-green-400" />
              </div>
              <div className="text-sm text-green-300 font-medium">Parsed successfully</div>
              <div className="text-xs text-slate-400 mt-1">Redirecting to dashboard…</div>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mb-3">
                <AlertCircle className="w-6 h-6 text-red-400" />
              </div>
              <div className="text-sm text-red-300 font-medium">Failed to parse</div>
              <div className="text-xs text-slate-400 mt-1">{error}</div>
            </>
          )}
        </label>

        {/* Warnings */}
        {warnings.length > 0 && (
          <div className="mt-4 rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4 space-y-1">
            {warnings.map((w, i) => (
              <div key={i} className="flex items-start gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0 mt-0.5" />
                <span className="text-xs text-yellow-300">{w}</span>
              </div>
            ))}
          </div>
        )}

        {/* Divider */}
        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 border-t border-slate-800" />
          <span className="text-xs text-slate-600">or</span>
          <div className="flex-1 border-t border-slate-800" />
        </div>

        {/* Demo button */}
        <button
          onClick={() => { loadMockData(); router.push('/overview'); }}
          className="w-full py-3 rounded-xl border border-slate-700 bg-slate-800/40 text-sm text-slate-300 hover:text-white hover:border-slate-500 hover:bg-slate-800/70 transition-colors font-medium"
        >
          Load demo data instead
        </button>

        <p className="text-xs text-slate-600 text-center mt-4">
          Your data never leaves your browser. All processing happens locally.
        </p>
      </div>
    </div>
  );
}
