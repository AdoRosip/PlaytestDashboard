'use client';
import { useState } from 'react';
import { Search } from 'lucide-react';
import { useDashboardStore, selectFilteredResponses } from '@/lib/store';
import PageHeader from '@/components/ui/PageHeader';
import Badge from '@/components/ui/Badge';
import { formatDate } from '@/lib/utils';

export default function ResponsesPage() {
  const responses  = useDashboardStore(selectFilteredResponses);
  const questions  = useDashboardStore((s) => s.questions);
  const testers    = useDashboardStore((s) => s.testers);
  const openTesterPanel = useDashboardStore((s) => s.openTesterPanel);
  const [search, setSearch] = useState('');

  const visible = responses.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return r.rawAnswer.toLowerCase().includes(q) ||
      questions.find((ques) => ques.id === r.questionId)?.text.toLowerCase().includes(q);
  }).slice(0, 100);

  return (
    <div className="mx-auto w-full max-w-[1680px] px-6 lg:px-8 py-8">
      <PageHeader title="Raw Responses" sub={`${responses.length} total responses`} />

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
        <input
          type="text"
          placeholder="Search responses or questions…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-md pl-9 pr-4 py-2 rounded-lg bg-slate-800/60 border border-slate-700 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/60 transition-colors"
        />
      </div>

      <div className="rounded-xl border border-slate-700/60 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700/60 bg-slate-800/40">
              {['Tester', 'Question', 'Answer', 'Status', 'Date', ''].map((h) => (
                <th key={h} className="text-left text-xs text-slate-500 font-medium px-4 py-3 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => {
              const q = questions.find((ques) => ques.id === r.questionId);
              const t = testers.find((tstr) => tstr.id === r.testerId);
              return (
                <tr key={r.id} className={`border-b border-slate-700/30 ${i % 2 === 0 ? '' : 'bg-slate-800/10'}`}>
                  <td className="px-4 py-3">
                    <div className="text-slate-300 text-xs font-medium">{t?.testerId ?? 'Unknown'}</div>
                    <div className="text-[10px] text-slate-600">{t?.ageGroup}</div>
                  </td>
                  <td className="px-4 py-3 max-w-[200px]">
                    <div className="text-xs text-slate-400 truncate">{q?.text ?? r.questionId}</div>
                  </td>
                  <td className="px-4 py-3 max-w-[200px]">
                    {r.numericValue !== null ? (
                      <span className="text-sm font-semibold text-white">{r.numericValue}</span>
                    ) : (
                      <span className="text-xs text-slate-300 line-clamp-2">{r.rawAnswer}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      label={r.matchStatus === 'matched' ? 'Matched' : r.matchStatus === 'needs_check' ? 'Review' : 'Unmatched'}
                      variant={r.matchStatus === 'matched' ? 'accent' : 'neutral'}
                    />
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">{formatDate(r.submittedAt)}</td>
                  <td className="px-4 py-3">
                    {t && (
                      <button
                        onClick={() => openTesterPanel(t.id)}
                        className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                      >
                        Profile →
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {visible.length === 0 && (
          <div className="text-center py-10 text-slate-500 text-sm">No responses found</div>
        )}
      </div>
      {responses.length > 100 && (
        <div className="text-xs text-slate-600 mt-3 text-center">
          Showing first 100 of {responses.length} responses. Use search to filter.
        </div>
      )}
    </div>
  );
}
