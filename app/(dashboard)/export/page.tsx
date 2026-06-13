'use client';
import { Download, FileText, Table2 } from 'lucide-react';
import { useDashboardStore } from '@/lib/store';
import PageHeader from '@/components/ui/PageHeader';

function exportToCSV(data: object[], filename: string) {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const rows = data.map((row) =>
    headers.map((h) => JSON.stringify((row as Record<string, unknown>)[h] ?? '')).join(',')
  );
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ExportPage() {
  const project   = useDashboardStore((s) => s.project);
  const responses = useDashboardStore((s) => s.responses);
  const questions = useDashboardStore((s) => s.questions);
  const testers   = useDashboardStore((s) => s.testers);
  const themes    = useDashboardStore((s) => s.themes);

  const handleExportResponses = () => {
    const data = responses.map((r) => {
      const q = questions.find((q) => q.id === r.questionId);
      const t = testers.find((t) => t.id === r.testerId);
      return {
        response_id: r.id,
        tester_id: t?.testerId ?? '',
        email: t?.email ?? '',
        question: q?.text ?? r.questionId,
        question_type: q?.type ?? '',
        answer: r.rawAnswer,
        numeric_value: r.numericValue ?? '',
        normalized_score: r.normalizedScore ?? '',
        match_status: r.matchStatus,
        submitted_at: r.submittedAt,
      };
    });
    exportToCSV(data, `${project?.name ?? 'playtest'}-responses.csv`);
  };

  const handleExportTesters = () => {
    const data = testers.map((t) => ({
      tester_id: t.testerId,
      email: t.email,
      discord: t.discord,
      age_group: t.ageGroup,
      country: t.country,
      gaming_profile: t.gamingProfile,
      hardware: t.hardware,
      avg_rating: t.avgRating ?? '',
      is_outlier: t.isOutlier ?? false,
    }));
    exportToCSV(data, `${project?.name ?? 'playtest'}-testers.csv`);
  };

  const handleExportThemes = () => {
    const data = themes.map((t) => ({
      label: t.label,
      severity: t.severity,
      priority: t.priority,
      frequency: t.frequency,
      confidence: Math.round(t.confidence * 100) + '%',
      summary: t.summary,
      affected_category: t.affectedCategory ?? '',
      quotes: t.representativeQuotes.join(' | '),
    }));
    exportToCSV(data, `${project?.name ?? 'playtest'}-themes.csv`);
  };

  const handlePrint = () => window.print();

  const exports = [
    {
      icon: Table2,
      title: 'All Responses',
      description: `${responses.length} rows including tester info, question, answer, and match status`,
      action: handleExportResponses,
      label: 'Export CSV',
      accent: 'text-indigo-400',
    },
    {
      icon: Table2,
      title: 'Tester Profiles',
      description: `${testers.length} testers with full profile data`,
      action: handleExportTesters,
      label: 'Export CSV',
      accent: 'text-indigo-400',
    },
    {
      icon: Table2,
      title: 'Themes Summary',
      description: `${themes.length} detected themes with severity, priority, and representative quotes`,
      action: handleExportThemes,
      label: 'Export CSV',
      accent: 'text-indigo-400',
    },
    {
      icon: FileText,
      title: 'Print / PDF Report',
      description: 'Print the current page view as a clean PDF report',
      action: handlePrint,
      label: 'Print',
      accent: 'text-slate-300',
    },
  ];

  return (
    <div className="mx-auto w-full max-w-3xl px-6 lg:px-8 py-8">
      <PageHeader
        title="Export"
        sub="Download your playtest data in various formats"
      />

      <div className="space-y-3">
        {exports.map(({ icon: Icon, title, description, action, label, accent }) => (
          <div key={title} className="flex items-center gap-5 rounded-xl border border-slate-700/60 bg-slate-800/20 px-6 py-5">
            <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center flex-shrink-0">
              <Icon className={`w-5 h-5 ${accent}`} />
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium text-white">{title}</div>
              <div className="text-xs text-slate-500 mt-0.5">{description}</div>
            </div>
            <button
              onClick={action}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-700 text-xs text-slate-300 hover:text-white hover:border-slate-500 hover:bg-slate-700/30 transition-colors font-medium"
            >
              <Download className="w-3.5 h-3.5" />
              {label}
            </button>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-xl border border-slate-700/40 bg-slate-800/10 p-4 text-xs text-slate-500">
        All exports are generated client-side. No data is sent to any server.
        Your playtest data stays on your machine.
      </div>
    </div>
  );
}
