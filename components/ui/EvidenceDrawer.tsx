'use client';
import { X, User } from 'lucide-react';
import { useDashboardStore, selectQuestion } from '@/lib/store';
import { formatDate, questionTypeLabel, formatTesterId } from '@/lib/utils';
import Badge from './Badge';

export default function EvidenceDrawer() {
  const drawerOpen = useDashboardStore((s) => s.drawerOpen);
  const drawerQuestionId = useDashboardStore((s) => s.drawerQuestionId);
  const drawerRatingValue = useDashboardStore((s) => s.drawerRatingValue);
  const closeDrawer = useDashboardStore((s) => s.closeDrawer);
  const openTesterPanel = useDashboardStore((s) => s.openTesterPanel);
  const responses = useDashboardStore((s) => s.responses);
  const testers = useDashboardStore((s) => s.testers);
  const questions = useDashboardStore((s) => s.questions);

  const question = drawerQuestionId
    ? selectQuestion({ questions } as Parameters<typeof selectQuestion>[0], drawerQuestionId)
    : null;

  const filteredResponses = responses.filter((r) => {
    if (r.questionId !== drawerQuestionId) return false;
    if (drawerRatingValue !== null && r.numericValue !== drawerRatingValue) return false;
    return true;
  });

  return (
    <>
      {/* Backdrop */}
      {drawerOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
          onClick={closeDrawer}
        />
      )}

      {/* Drawer */}
      <div className={`
        fixed right-0 top-0 h-full w-[480px] bg-[#0d1220] border-l border-slate-800
        z-50 flex flex-col transition-transform duration-300
        ${drawerOpen ? 'translate-x-0' : 'translate-x-full'}
      `}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div>
            <h2 className="text-sm font-semibold text-white">
              {drawerRatingValue !== null
                ? `Score ${drawerRatingValue} · ${filteredResponses.length} tester${filteredResponses.length !== 1 ? 's' : ''}`
                : `All responses · ${filteredResponses.length}`}
            </h2>
            {question && (
              <p className="text-xs text-slate-400 mt-0.5 max-w-xs truncate">{question.text}</p>
            )}
          </div>
          <button
            onClick={closeDrawer}
            className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Response list */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {filteredResponses.length === 0 ? (
            <div className="text-center py-10 text-slate-500 text-sm">No responses found</div>
          ) : (
            filteredResponses.map((r) => {
              const tester = testers.find((t) => t.id === r.testerId);
              return (
                <div key={r.id} className="rounded-lg border border-slate-700/60 bg-slate-800/30 p-4 space-y-3">
                  {/* Tester row */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-indigo-600/30 flex items-center justify-center">
                        <User className="w-3.5 h-3.5 text-indigo-300" />
                      </div>
                      <div>
                        <div className="text-xs font-medium text-slate-200">
                          {tester ? formatTesterId(tester.testerId) : 'Unknown'}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {tester ? `${tester.ageGroup} · ${tester.country}` : 'Unmatched'}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {r.numericValue !== null && (
                        <span className="text-lg font-bold text-white">{r.numericValue}</span>
                      )}
                      <Badge
                        label={r.matchStatus === 'matched' ? 'Matched' : 'Unmatched'}
                        variant={r.matchStatus === 'matched' ? 'accent' : 'neutral'}
                      />
                    </div>
                  </div>

                  {/* Answer */}
                  {r.rawAnswer && r.numericValue === null && (
                    <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/50 rounded p-3 border border-slate-700/40">
                      &ldquo;{r.rawAnswer}&rdquo;
                    </p>
                  )}

                  {/* Meta */}
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-600">{formatDate(r.submittedAt)}</span>
                    {tester && (
                      <button
                        onClick={() => openTesterPanel(tester.id)}
                        className="text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors"
                      >
                        View profile →
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
