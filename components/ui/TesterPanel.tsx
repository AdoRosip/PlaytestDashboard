'use client';
import { X, Star, AlertTriangle, UserX, Target, PenLine } from 'lucide-react';
import { useDashboardStore, selectGameConfig } from '@/lib/store';
import { formatDate, formatTesterId } from '@/lib/utils';
import { flagLabel } from '@/lib/outliers';
import { genreFit, engagement, testerGenres, testerPlaystyles, ENGAGEMENT_LABELS } from '@/lib/testerProfile';
import type { EngagementTier } from '@/lib/testerProfile';
import { SEGMENT_LABELS } from '@/lib/types';
import type { SegmentKey } from '@/lib/types';

const SEGMENT_GROUPS: { label: string; keys: SegmentKey[] }[] = [
  { label: 'Demographics',  keys: ['age_group', 'gender', 'country', 'employment', 'availability'] },
  { label: 'Gaming',        keys: ['gamer_type', 'gaming_hours', 'platform', 'gaming_pref', 'industry'] },
  { label: 'Setup',         keys: ['hardware_tier', 'has_controller', 'has_mic'] },
];

const ENGAGEMENT_STYLE: Record<EngagementTier, string> = {
  detailed: 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
  brief:    'text-sky-300 border-sky-500/40 bg-sky-500/10',
  minimal:  'text-slate-300 border-slate-500/40 bg-slate-500/10',
  none:     'text-slate-500 border-slate-700 bg-slate-800/40',
};

export default function TesterPanel() {
  const testerPanelOpen    = useDashboardStore((s) => s.testerPanelOpen);
  const activeTesterId     = useDashboardStore((s) => s.activeTesterId);
  const closeTesterPanel   = useDashboardStore((s) => s.closeTesterPanel);
  const testers            = useDashboardStore((s) => s.testers);
  const responses          = useDashboardStore((s) => s.responses);
  const questions          = useDashboardStore((s) => s.questions);
  const config             = useDashboardStore(selectGameConfig);

  const tester         = testers.find((t) => t.id === activeTesterId);
  const testerResponses = responses.filter((r) => r.testerId === activeTesterId);

  const fit    = tester ? genreFit(tester, config) : null;
  const eng    = tester ? engagement(tester.id, responses, questions) : null;
  const genres = tester ? testerGenres(tester) : [];
  const playstyles = tester ? testerPlaystyles(tester) : [];

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

              {tester.inRegistry === false && (
                <div className="mb-4 flex items-start gap-2 rounded-lg bg-amber-500/5 border border-amber-500/20 px-3 py-2">
                  <UserX className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-semibold text-amber-300">Not in registry</div>
                    <div className="text-[11px] text-slate-400 leading-relaxed">
                      This email wasn&apos;t found in the Playlytix registry, so no demographic
                      profile is available. Their feedback is still counted.
                    </div>
                  </div>
                </div>
              )}

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

            {/* Tester quality — engagement + genre fit */}
            <div className="px-6 py-4 border-b border-slate-800">
              <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-3">
                Tester Quality
              </div>
              <div className="space-y-2">
                {eng && (
                  <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${ENGAGEMENT_STYLE[eng.tier]}`}>
                    <PenLine className="w-3.5 h-3.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold">{ENGAGEMENT_LABELS[eng.tier]}</div>
                      <div className="text-[11px] opacity-80">
                        {eng.answered}/{eng.freeTextTotal} written answers · ~{Math.round(eng.avgWords)} words avg
                      </div>
                    </div>
                  </div>
                )}
                {fit && fit.target.length > 0 && (
                  <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
                    fit.unknown ? 'text-slate-500 border-slate-700 bg-slate-800/40'
                    : fit.isFit ? 'text-cyan-300 border-cyan-500/40 bg-cyan-500/10'
                    : 'text-slate-400 border-slate-600 bg-slate-800/40'
                  }`}>
                    <Target className="w-3.5 h-3.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold">
                        {fit.unknown ? 'Genre taste unknown' : fit.isFit ? 'Target-genre player' : 'Outside target genres'}
                      </div>
                      <div className="text-[11px] opacity-80">
                        {fit.unknown
                          ? 'not in the Type-of-Gamer data'
                          : `plays ${fit.matched.length} of ${fit.target.length} target genres${fit.matched.length ? ` · ${fit.matched.join(', ')}` : ''}`}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Player taste — genres & playstyles from the Type-of-Gamer data */}
            {(genres.length > 0 || playstyles.length > 0) && (
              <div className="px-6 py-4 border-b border-slate-800">
                <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-3">
                  Player Taste
                </div>
                {genres.length > 0 && (
                  <div className="mb-3">
                    <div className="text-[10px] text-slate-600 uppercase tracking-widest mb-2">Genres</div>
                    <div className="flex flex-wrap gap-1.5">
                      {genres.map((g) => {
                        const isTarget = (config.targetGenres ?? []).some((t) => t.match.test(g));
                        return (
                          <span
                            key={g}
                            className={`rounded-full px-2 py-0.5 text-[11px] border ${
                              isTarget
                                ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300'
                                : 'border-slate-700 bg-slate-900/40 text-slate-300'
                            }`}
                          >
                            {g}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
                {playstyles.length > 0 && (
                  <div>
                    <div className="text-[10px] text-slate-600 uppercase tracking-widest mb-2">Playstyles</div>
                    <div className="flex flex-wrap gap-1.5">
                      {playstyles.map((p) => (
                        <span key={p} className="rounded-full px-2 py-0.5 text-[11px] border border-slate-700 bg-slate-900/40 text-slate-300">
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

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
