'use client';
import { X, Star, AlertTriangle } from 'lucide-react';
import { useDashboardStore } from '@/lib/store';
import { formatDate, formatTesterId } from '@/lib/utils';
import { flagLabel } from '@/lib/outliers';
import { SEGMENT_LABELS } from '@/lib/types';
import type { SegmentKey } from '@/lib/types';

const SEGMENT_GROUPS: { label: string; keys: SegmentKey[] }[] = [
  { label: 'Demographics',  keys: ['age_group', 'gender', 'country', 'employment', 'availability'] },
  { label: 'Gaming',        keys: ['gamer_type', 'gaming_hours', 'platform', 'gaming_pref', 'industry'] },
  { label: 'Setup',         keys: ['hardware_tier', 'has_controller', 'has_mic'] },
];

export default function TesterPanel() {
  const testerPanelOpen    = useDashboardStore((s) => s.testerPanelOpen);
  const activeTesterId     = useDashboardStore((s) => s.activeTesterId);
  const closeTesterPanel   = useDashboardStore((s) => s.closeTesterPanel);
  const testers            = useDashboardStore((s) => s.testers);
  const responses          = useDashboardStore((s) => s.responses);
  const questions          = useDashboardStore((s) => s.questions);

  const tester         = testers.find((t) => t.id === activeTesterId);
  const testerResponses = responses.filter((r) => r.testerId === activeTesterId);

  return (
    <>
      {testerPanelOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-[60] backdrop-blur-sm"
          onClick={closeTesterPanel}
        />
      )}

      <div className={`
        fixed right-0 top-0 h-full w-[420px] bg-[#0d1220] border-l border-slate-800
        z-[70] flex flex-col transition-transform duration-300
        ${testerPanelOpen ? 'translate-x-0' : 'translate-x-full'}
      `}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <h2 className="text-sm font-semibold text-white">Tester Profile</h2>
          <button
            onClick={closeTesterPanel}
            className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!tester ? (
          <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
            Tester not found
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {/* Identity */}
            <div className="px-6 py-5 border-b border-slate-800">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-indigo-600/30 flex items-center justify-center text-indigo-300 font-bold text-sm">
                  {tester.testerId.slice(-2)}
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">{formatTesterId(tester.testerId)}</div>
                  <div className="text-xs text-slate-400">{tester.email || tester.discord}</div>
                  {tester.email && tester.discord && (
                    <div className="text-xs text-slate-600">{tester.discord}</div>
                  )}
                </div>
              </div>

              {tester.quality && tester.quality.flags.length > 0 && (
                <div className="mb-4 space-y-1.5">
                  {tester.quality.flags.map((f) => (
                    <div key={f.type} className="flex items-start gap-2 rounded-lg bg-yellow-500/5 border border-yellow-500/20 px-3 py-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <div className="text-xs font-semibold text-yellow-300">{flagLabel(f.type)}</div>
                        <div className="text-[11px] text-slate-400 leading-relaxed">{f.detail}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-slate-800/40 border border-slate-700/50 p-3">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Avg Rating</div>
                  <div className="flex items-center gap-1">
                    <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                    <span className="text-sm font-semibold text-white">
                      {tester.avgRating !== undefined ? tester.avgRating.toFixed(1) : '—'}
                    </span>
                  </div>
                </div>
                <div className="rounded-lg bg-slate-800/40 border border-slate-700/50 p-3">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Responses</div>
                  <div className="text-sm font-semibold text-white">{testerResponses.length}</div>
                </div>
              </div>
            </div>

            {/* Segments from registration */}
            <div className="px-6 py-4 border-b border-slate-800">
              <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-4">
                Registration Profile
              </div>

              {Object.keys(tester.segments).length === 0 ? (
                <p className="text-xs text-slate-600">No registration data — response-only tester</p>
              ) : (
                <div className="space-y-5">
                  {SEGMENT_GROUPS.map(({ label, keys }) => {
                    const items = keys
                      .filter((k) => tester.segments[k])
                      .map((k) => ({ key: k, value: tester.segments[k]! }));
                    if (!items.length) return null;
                    return (
                      <div key={label}>
                        <div className="text-[10px] text-slate-600 uppercase tracking-widest mb-2">
                          {label}
                        </div>
                        <div className="space-y-1.5">
                          {items.map(({ key, value }) => (
                            <div key={key} className="flex items-start gap-2">
                              <span className="text-xs text-slate-500 w-24 flex-shrink-0">
                                {SEGMENT_LABELS[key]}
                              </span>
                              <span className="text-xs text-slate-300 leading-relaxed">{value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Responses */}
            <div className="px-6 py-4 space-y-2">
              <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-3">
                All Responses ({testerResponses.length})
              </div>
              {testerResponses.map((r) => {
                const q = questions.find((q) => q.id === r.questionId);
                return (
                  <div key={r.id} className="rounded-lg border border-slate-700/50 bg-slate-800/20 p-3">
                    <div className="text-xs text-slate-400 mb-1 truncate">{q?.text ?? r.questionId}</div>
                    {r.numericValue !== null ? (
                      <div className="flex items-center gap-1">
                        <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                        <span className="text-sm font-semibold text-white">{r.numericValue}</span>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-300 leading-relaxed line-clamp-2">
                        {r.rawAnswer}
                      </p>
                    )}
                    <div className="text-[10px] text-slate-600 mt-1">{formatDate(r.submittedAt)}</div>
                  </div>
                );
              })}
              {testerResponses.length === 0 && (
                <div className="text-xs text-slate-500 text-center py-4">No responses recorded</div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
