'use client';
import { useDashboardStore } from '@/lib/store';
import PageHeader from '@/components/ui/PageHeader';
import { useRouter } from 'next/navigation';

export default function SettingsPage() {
  const project = useDashboardStore((s) => s.project);
  const loadMockData = useDashboardStore((s) => s.loadMockData);
  const router = useRouter();

  return (
    <div className="mx-auto w-full max-w-2xl px-6 lg:px-8 py-8">
      <PageHeader title="Settings" sub="Project configuration" />

      <div className="space-y-4">
        {project && (
          <div className="rounded-xl border border-slate-700/60 bg-slate-800/20 p-5 space-y-3">
            <h2 className="text-sm font-semibold text-white">Current Project</h2>
            {[
              { label: 'Project name', value: project.name },
              { label: 'Game', value: project.gameName },
              { label: 'Playtest', value: project.playtestName },
              { label: 'Total responses', value: project.totalResponses },
              { label: 'Matched testers', value: project.matchedTesters },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-xs text-slate-500">{label}</span>
                <span className="text-xs text-slate-300 font-medium">{value}</span>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-xl border border-slate-700/60 bg-slate-800/20 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-white">Data</h2>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-300">Upload new Excel file</div>
              <div className="text-[11px] text-slate-500 mt-0.5">Replace current data with a new playtest export</div>
            </div>
            <button
              onClick={() => router.push('/upload')}
              className="px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-300 hover:text-white hover:border-slate-500 transition-colors"
            >
              Upload
            </button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-300">Load demo data</div>
              <div className="text-[11px] text-slate-500 mt-0.5">Replace with Exovia Alpha sample dataset</div>
            </div>
            <button
              onClick={() => { loadMockData(); router.push('/overview'); }}
              className="px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-300 hover:text-white hover:border-slate-500 transition-colors"
            >
              Load demo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
