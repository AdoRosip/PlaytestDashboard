'use client';
import { useMemo } from 'react';
import { X, SlidersHorizontal, Info } from 'lucide-react';
import { useDashboardStore, selectActiveFilterCount } from '@/lib/store';
import { sentimentBand, SENTIMENT_BAND_LABELS, buildEnjoyRatingMap } from '@/lib/filtering';
import { continentFor, CONTINENTS } from '@/lib/geo';
import type { FilterState, SentimentBand } from '@/lib/types';

const SENTIMENT_BANDS: SentimentBand[] = ['almost_believers'];
const SENTIMENT_RANGE: Record<SentimentBand, string> = {
  detractors: '< 3',
  almost_believers: '3–4',
  believers: '> 4',
};

const HARDWARE_TIERS = ['High', 'Mid', 'Low'];
const PLAYTIME_OPTIONS: { label: string; value: FilterState['sessionPlaytime'] }[] = [
  { label: '< 1h',  value: '<1h'  },
  { label: '1–3h',  value: '1-3h' },
  { label: '3–6h',  value: '3-6h' },
  { label: '6h+',   value: '6h+'  },
];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
      {children}
    </div>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors border ${
        active
          ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-300'
          : 'border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600'
      }`}
    >
      {label}
    </button>
  );
}

function FilterCheckbox({ label, checked, onChange, tooltip }: { label: string; checked: boolean; onChange: () => void; tooltip?: string }) {
  return (
    <div className="flex items-center gap-1.5 w-full">
      <button onClick={onChange} className="flex items-center gap-2.5 flex-1 group py-1 min-w-0">
        <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
          checked ? 'bg-indigo-600 border-indigo-600' : 'border-slate-600 group-hover:border-slate-400'
        }`}>
          {checked && <span className="text-white text-[9px] leading-none font-bold">✓</span>}
        </div>
        <span className={`text-xs transition-colors ${checked ? 'text-slate-200' : 'text-slate-400 group-hover:text-slate-200'}`}>
          {label}
        </span>
      </button>
      {tooltip && (
        <span title={tooltip} className="flex-shrink-0 text-slate-500 hover:text-slate-300 transition-colors cursor-help">
          <Info className="w-3.5 h-3.5" />
        </span>
      )}
    </div>
  );
}

export default function FilterPanel() {
  const testers        = useDashboardStore((s) => s.testers);
  const questions      = useDashboardStore((s) => s.questions);
  const responses      = useDashboardStore((s) => s.responses);
  const filters        = useDashboardStore((s) => s.filters);
  const setFilter      = useDashboardStore((s) => s.setFilter);
  const clearFilters   = useDashboardStore((s) => s.clearFilters);
  const activeCount    = useDashboardStore(selectActiveFilterCount);

  // Derive available options from registered tester data.
  // Countries are grouped into continents (see lib/geo); only continents that
  // actually appear in the data are shown, ordered by the canonical CONTINENTS
  // list so "Unknown" surfaces last when name-mapping gaps exist.
  const { ageGroups, genders, continents } = useMemo(() => {
    const ageCounts: Record<string, number> = {};
    const genderCounts: Record<string, number> = {};
    const continentCounts: Record<string, number> = {};
    for (const t of testers) {
      if (t.ageGroup) ageCounts[t.ageGroup] = (ageCounts[t.ageGroup] ?? 0) + 1;
      const g = t.segments.gender;
      if (g) genderCounts[g] = (genderCounts[g] ?? 0) + 1;
      const c = t.country || t.segments.country || '';
      if (c) {
        const cont = continentFor(c);
        continentCounts[cont] = (continentCounts[cont] ?? 0) + 1;
      }
    }
    return {
      ageGroups: Object.keys(ageCounts).sort(),
      genders:   Object.entries(genderCounts).sort((a, b) => b[1] - a[1]).map(([k]) => k),
      continents: CONTINENTS.filter((c) => continentCounts[c] > 0)
        .map((c) => ({ label: c, count: continentCounts[c] })),
    };
  }, [testers]);

  // Only show background game filters if those questions exist in the form
  const hasFactorioQ = questions.some((q) => /factorio/i.test(q.text) && q.categoryId === 'cat_01');
  const hasSatQ      = questions.some((q) => /satisfactory/i.test(q.text) && q.categoryId === 'cat_01');
  const hasSessionQ  = questions.some((q) =>
    /how many hours.*(?:play|game|session)|hours.*played.*(?:exo|game|session)/i.test(q.text)
  );

  // Player-sentiment band counts (drive the sentiment segment).
  // Bands come from the single "overall enjoyment" question — only testers who
  // answered it get a band.
  const sentimentCounts = useMemo(() => {
    const counts: Record<SentimentBand, number> = {
      detractors: 0, almost_believers: 0, believers: 0,
    };
    const enjoyMap = buildEnjoyRatingMap(responses, questions);
    let classified = 0;
    for (const t of testers) {
      const band = sentimentBand(enjoyMap.get(t.id));
      if (band) { counts[band]++; classified++; }
    }
    return { counts, classified };
  }, [testers, responses, questions]);

  // Data-quality flag counts (drive the exclusion controls)
  const straightLinerCount = testers.filter((t) => t.quality?.straightLining).length;
  // Sentiment outliers in both directions: harsh critics + overly positive.
  const outlierCount = testers.filter(
    (t) => t.quality?.sentiment === 'harsh' || t.quality?.sentiment === 'generous',
  ).length;
  const hasQualityFlags = straightLinerCount > 0 || outlierCount > 0;

  const toggle = <K extends 'ageGroups' | 'genders' | 'continents' | 'countries' | 'hardwareTiers'>(key: K, value: string) => {
    const cur = filters[key] as string[];
    setFilter({ [key]: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value] } as Partial<FilterState>);
  };

  return (
    <div className="fixed left-[220px] top-0 h-full w-[260px] bg-[#0d1220] border-r border-slate-800 flex flex-col z-30 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 flex-shrink-0">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-sm font-semibold text-white">Filters</span>
          {activeCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-600/30 text-indigo-300 border border-indigo-500/30">
              {activeCount}
            </span>
          )}
        </div>
        {activeCount > 0 && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-white transition-colors"
          >
            <X className="w-3 h-3" /> Clear
          </button>
        )}
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">

        {/* Demographics */}
        <div>
          <SectionLabel>Demographics</SectionLabel>

          {ageGroups.length > 0 && (
            <div className="mb-4">
              <div className="text-xs text-slate-400 mb-2">Age Group</div>
              <div className="flex flex-wrap gap-1.5">
                {ageGroups.map((v) => (
                  <Chip key={v} label={v} active={filters.ageGroups.includes(v)} onClick={() => toggle('ageGroups', v)} />
                ))}
              </div>
            </div>
          )}

          <div className="mb-4">
            <div className="text-xs text-slate-400 mb-2">Hardware Tier</div>
            <div className="flex flex-wrap gap-1.5">
              {HARDWARE_TIERS.map((v) => (
                <Chip key={v} label={v} active={filters.hardwareTiers.includes(v)} onClick={() => toggle('hardwareTiers', v)} />
              ))}
            </div>
          </div>

          {genders.length > 0 && (
            <div className="mb-4">
              <div className="text-xs text-slate-400 mb-2">Gender</div>
              <div className="flex flex-wrap gap-1.5">
                {genders.map((v) => (
                  <Chip key={v} label={v} active={filters.genders.includes(v)} onClick={() => toggle('genders', v)} />
                ))}
              </div>
            </div>
          )}

          {continents.length > 0 && (
            <div>
              <div className="text-xs text-slate-400 mb-2">Region</div>
              <div className="flex flex-wrap gap-1.5">
                {continents.map(({ label, count }) => (
                  <Chip
                    key={label}
                    label={`${label} (${count})`}
                    active={filters.continents.includes(label)}
                    onClick={() => toggle('continents', label)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Country filter — replaced by Region (continent) grouping for now.
              Kept here so it can be reinstated later as a drill-down.
          {countries.length > 0 && (
            <div>
              <div className="text-xs text-slate-400 mb-2">Country</div>
              <div className="flex flex-wrap gap-1.5">
                {countries.slice(0, 14).map((v) => (
                  <Chip key={v} label={v} active={filters.countries.includes(v)} onClick={() => toggle('countries', v)} />
                ))}
                {countries.length > 14 && (
                  <span className="text-[10px] text-slate-600 self-center">+{countries.length - 14} more</span>
                )}
              </div>
            </div>
          )}
          */}
        </div>

        {/* Player Sentiment */}
        {sentimentCounts.classified > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-3">
              <SectionLabel>Player Sentiment</SectionLabel>
              <span
                title={
                  'Bands by each tester’s answer to the “overall enjoyment” ' +
                  'question (How much did you enjoy the game overall?), on a 0–5 ' +
                  'scale: Detractors < 3, Almost Believers 3–4 (on the fence — ' +
                  'interested but not sold), Believers > 4. Testers who didn’t ' +
                  'answer that question are not shown in any band.'
                }
                className="flex-shrink-0 -mt-2.5 text-slate-500 hover:text-slate-300 transition-colors cursor-help"
              >
                <Info className="w-3.5 h-3.5" />
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Chip
                label="All"
                active={filters.playerSentiment === null}
                onClick={() => setFilter({ playerSentiment: null })}
              />
              {SENTIMENT_BANDS.map((band) => (
                <Chip
                  key={band}
                  label={`${SENTIMENT_BAND_LABELS[band]} (${sentimentCounts.counts[band]})`}
                  active={filters.playerSentiment === band}
                  onClick={() =>
                    setFilter({ playerSentiment: filters.playerSentiment === band ? null : band })
                  }
                />
              ))}
            </div>
            {filters.playerSentiment && (
              <p className="text-[10px] text-slate-500 leading-relaxed mt-2">
                Showing only {SENTIMENT_BAND_LABELS[filters.playerSentiment].toLowerCase()} —
                testers whose overall enjoyment rating is {SENTIMENT_RANGE[filters.playerSentiment]}.
              </p>
            )}
          </div>
        )}

        {/* Session */}
        {hasSessionQ && (
          <div>
            <SectionLabel>Playtest Session</SectionLabel>
            <div className="text-xs text-slate-400 mb-2">Time Played</div>
            <div className="flex flex-wrap gap-1.5">
              {PLAYTIME_OPTIONS.map((opt) => (
                <Chip
                  key={opt.value!}
                  label={opt.label}
                  active={filters.sessionPlaytime === opt.value}
                  onClick={() => setFilter({ sessionPlaytime: filters.sessionPlaytime === opt.value ? null : opt.value })}
                />
              ))}
            </div>
          </div>
        )}

        {/* Game Background */}
        {(hasFactorioQ || hasSatQ) && (
          <div>
            <SectionLabel>Game Background</SectionLabel>
            <div className="space-y-1">
              {hasFactorioQ && (
                <FilterCheckbox
                  label="Played Factorio"
                  checked={filters.playedFactorio}
                  onChange={() => setFilter({ playedFactorio: !filters.playedFactorio })}
                />
              )}
              {hasSatQ && (
                <FilterCheckbox
                  label="Played Satisfactory"
                  checked={filters.playedSatisfactory}
                  onChange={() => setFilter({ playedSatisfactory: !filters.playedSatisfactory })}
                />
              )}
            </div>
          </div>
        )}

        {/* Data Quality */}
        {hasQualityFlags && (
          <div>
            <SectionLabel>Data Quality</SectionLabel>
            <div className="space-y-1">
              {straightLinerCount > 0 && (
                <FilterCheckbox
                  label={`Exclude straight-liners (${straightLinerCount})`}
                  checked={filters.excludeStraightLiners}
                  onChange={() => setFilter({ excludeStraightLiners: !filters.excludeStraightLiners })}
                />
              )}
              {outlierCount > 0 && (
                <FilterCheckbox
                  label={`Exclude outliers (${outlierCount})`}
                  checked={filters.excludeSentimentOutliers}
                  onChange={() => setFilter({ excludeSentimentOutliers: !filters.excludeSentimentOutliers })}
                  tooltip={
                    'Outliers are testers who rate far from the group in either direction — ' +
                    'much harsher OR much more positive than the median (beyond ~2.5σ, measured ' +
                    'per question so question-mix doesn’t bias it). Excluding both ends gives a ' +
                    'trimmed, middle-of-the-pack view. Use for robustness checks, not data cleaning.'
                  }
                />
              )}
            </div>
            {filters.excludeSentimentOutliers && (
              <p className="text-[10px] text-amber-400/80 leading-relaxed mt-2">
                Removing the most extreme testers on both ends shifts every score toward the
                median — use for robustness checks, not data cleaning.
              </p>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
