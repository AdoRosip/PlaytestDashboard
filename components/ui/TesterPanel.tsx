'use client';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X, Star, AlertTriangle, UserX, Target, PenLine, ChevronDown } from 'lucide-react';
import { useDashboardStore, selectGameConfig } from '@/lib/store';
import { formatDate, formatTesterLabel } from '@/lib/utils';
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

/**
 * One titled block in the left rail. Keeps the rail's flat, divider-separated
 * look — the heading just becomes a button, so a tester with a full registry
 * profile can be folded down to the blocks you actually want open.
 */
function RailSection({
  title, children, defaultOpen = true,
}: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();

  return (
    // `last:` keeps the bottom-most block flush with the rail's own edge, the
    // way the hand-written dividers used to.
    <div className="border-b border-slate-800 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls={contentId}
        className="flex w-full items-center justify-between gap-3 px-6 pb-3 pt-4 text-left transition-colors hover:bg-slate-800/30"
      >
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">{title}</span>
        <ChevronDown
          className={`h-4 w-4 flex-shrink-0 text-slate-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <div id={contentId} className="px-6 pb-4">{children}</div>}
    </div>
  );
}

/**
 * Tester profile — a centred dialog rather than the 420px right-hand drawer it
 * used to be. The profile blocks (identity, quality, taste, profile) are
 * reference material and stay in a fixed left rail; the responses are what
 * people actually come to read, so they get the remaining width in full, with
 * no truncated question text or clamped answers. Below `lg` the same content
 * falls back to a full-screen sheet in one column.
 */
export default function TesterPanel() {
  const testerPanelOpen    = useDashboardStore((s) => s.testerPanelOpen);
  const activeTesterId     = useDashboardStore((s) => s.activeTesterId);
  const closeTesterPanel   = useDashboardStore((s) => s.closeTesterPanel);
  const testers            = useDashboardStore((s) => s.testers);
  const responses          = useDashboardStore((s) => s.responses);
  const questions          = useDashboardStore((s) => s.questions);
  const config             = useDashboardStore(selectGameConfig);

  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Modal behaviour: scroll lock, Escape to close, Tab trapped inside, focus
  // returned to whatever opened it (a tester row, an evidence quote).
  useEffect(() => {
    if (!testerPanelOpen) return;

    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeTesterPanel();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [testerPanelOpen, closeTesterPanel]);

  if (!testerPanelOpen) return null;

  const tester          = testers.find((t) => t.id === activeTesterId);
  const testerResponses = responses.filter((r) => r.testerId === activeTesterId);

  const fit        = tester ? genreFit(tester, config) : null;
  const eng        = tester ? engagement(tester.id, responses, questions) : null;
  const genres     = tester ? testerGenres(tester) : [];
  const playstyles = tester ? testerPlaystyles(tester) : [];
  const testerLabel = tester ? formatTesterLabel(tester) : '';
  const registryLabel = tester
    ? tester.inRegistry === true ? 'Registry tester'
      : tester.inRegistry === false ? 'Response-only tester'
      : 'Tester'
    : '';

  return createPortal(
    <>
      <button
        type="button"
        aria-label="Close tester profile"
        onClick={closeTesterPanel}
        className="backdrop-enter fixed inset-0 z-[60] cursor-default bg-black/60 backdrop-blur-sm"
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="dialog-enter fixed inset-0 z-[70] flex flex-col overflow-hidden border-slate-700/70 bg-[#0d1220]
          lg:inset-auto lg:left-1/2 lg:top-[5vh] lg:h-[90vh] lg:w-[94vw] lg:max-w-[1200px]
          lg:-translate-x-1/2 lg:rounded-2xl lg:border lg:shadow-2xl lg:shadow-black/70"
      >
        {/* Header */}
        <div className="flex flex-shrink-0 items-center justify-between gap-4 border-b border-slate-800 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            {/* The tester *is* the subject of the dialog, so their label carries
                the title on its own. What kind of tester they are is already
                spelled out under the avatar in the identity block below. */}
            <h2 id={titleId} className="truncate text-lg font-semibold tracking-tight text-white">
              {testerLabel || 'Tester Profile'}
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            onClick={closeTesterPanel}
            aria-label="Close tester profile"
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-indigo-400/70"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {!tester ? (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
            Tester not found
          </div>
        ) : (
          // One scrolling column below `lg`; two independently scrolling panes
          // from `lg` so the profile stays put while the responses scroll.
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">

            {/* ── Left rail: who this tester is ─────────────────────────── */}
            <div className="flex-shrink-0 border-b border-slate-800 lg:w-[360px] lg:overflow-y-auto lg:border-b-0 lg:border-r">
              {/* Identity */}
              <div className="border-b border-slate-800 px-6 py-5">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-600/30 text-sm font-bold text-indigo-300">
                    {testerLabel.slice(-2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-white">{testerLabel}</div>
                    <div className="text-xs text-slate-400">{registryLabel}</div>
                  </div>
                </div>

                {tester.inRegistry === false && (
                  <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
                    <UserX className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-400" />
                    <div>
                      <div className="text-xs font-semibold text-amber-300">Not in registry</div>
                      <div className="text-[11px] leading-relaxed text-slate-400">
                        No matching Playlytix registry profile was found, so demographic data
                        is unavailable. Their feedback is still counted.
                      </div>
                    </div>
                  </div>
                )}

                {tester.quality && tester.quality.flags.length > 0 && (
                  <div className="mb-4 space-y-1.5">
                    {tester.quality.flags.map((f) => (
                      <div key={f.type} className="flex items-start gap-2 rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-3 py-2">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-yellow-400" />
                        <div>
                          <div className="text-xs font-semibold text-yellow-300">{flagLabel(f.type)}</div>
                          <div className="text-[11px] leading-relaxed text-slate-400">{f.detail}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-slate-700/50 bg-slate-800/40 p-3">
                    <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Avg Rating</div>
                    <div className="flex items-center gap-1">
                      <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                      <span className="text-sm font-semibold text-white">
                        {tester.avgRating !== undefined ? tester.avgRating.toFixed(1) : '—'}
                      </span>
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-700/50 bg-slate-800/40 p-3">
                    <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Responses</div>
                    <div className="text-sm font-semibold text-white">{testerResponses.length}</div>
                  </div>
                </div>
              </div>

              {/* Tester quality — engagement + genre fit */}
              <RailSection title="Tester Quality">
                <div className="space-y-2">
                  {eng && (
                    <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${ENGAGEMENT_STYLE[eng.tier]}`}>
                      <PenLine className="h-3.5 w-3.5 flex-shrink-0" />
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
                      <Target className="h-3.5 w-3.5 flex-shrink-0" />
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
              </RailSection>

              {/* Player taste — genres & playstyles from the Type-of-Gamer data */}
              {(genres.length > 0 || playstyles.length > 0) && (
                <RailSection title="Player Taste">
                  {genres.length > 0 && (
                    <div className="mb-3">
                      <div className="mb-2 text-[10px] uppercase tracking-widest text-slate-600">Genres</div>
                      <div className="flex flex-wrap gap-1.5">
                        {genres.map((g) => {
                          const isTarget = (config.targetGenres ?? []).some((t) => t.match.test(g));
                          return (
                            <span
                              key={g}
                              className={`rounded-full border px-2 py-0.5 text-[11px] ${
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
                      <div className="mb-2 text-[10px] uppercase tracking-widest text-slate-600">Playstyles</div>
                      <div className="flex flex-wrap gap-1.5">
                        {playstyles.map((p) => (
                          <span key={p} className="rounded-full border border-slate-700 bg-slate-900/40 px-2 py-0.5 text-[11px] text-slate-300">
                            {p}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </RailSection>
              )}

              {/* Segments from registration */}
              <RailSection title="Profile">
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
                          <div className="mb-2 text-[10px] uppercase tracking-widest text-slate-600">
                            {label}
                          </div>
                          <div className="space-y-1.5">
                            {items.map(({ key, value }) => (
                              <div key={key} className="flex items-start gap-2">
                                <span className="w-24 flex-shrink-0 text-xs text-slate-500">
                                  {SEGMENT_LABELS[key]}
                                </span>
                                <span className="min-w-0 text-xs leading-relaxed text-slate-300">{value}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </RailSection>
            </div>

            {/* ── Right pane: what they actually said ───────────────────── */}
            <div className="min-w-0 flex-1 px-6 pb-6 lg:overflow-y-auto">
              <div className="sticky top-0 z-10 bg-[#0d1220] py-4 text-xs font-medium uppercase tracking-wide text-slate-400">
                All Responses ({testerResponses.length})
              </div>
              <div className="space-y-2">
                {testerResponses.map((r) => {
                  const q = questions.find((q) => q.id === r.questionId);
                  return (
                    <div key={r.id} className="rounded-lg border border-slate-700/50 bg-slate-800/20 p-4">
                      {/* Full question text and full answer — the drawer clipped
                          both to fit 420px, which is the readability complaint
                          this layout exists to fix. */}
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 text-xs leading-relaxed text-slate-400">
                          {q?.text ?? r.questionId}
                        </div>
                        {r.numericValue !== null && (
                          <div className="flex flex-shrink-0 items-center gap-1">
                            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                            <span className="text-sm font-semibold text-white">{r.numericValue}</span>
                          </div>
                        )}
                      </div>
                      {r.numericValue === null && r.rawAnswer && (
                        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-200">
                          {r.rawAnswer}
                        </p>
                      )}
                      <div className="mt-2 text-[10px] text-slate-600">{formatDate(r.submittedAt)}</div>
                    </div>
                  );
                })}
                {testerResponses.length === 0 && (
                  <div className="py-4 text-center text-xs text-slate-500">No responses recorded</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </>,
    document.body,
  );
}
