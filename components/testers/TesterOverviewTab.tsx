'use client';
import { useMemo } from 'react';
import type { Tester } from '@/lib/types';
import type { GameConfig } from '@/lib/games';
import { CORE_AUDIENCE_HOURS, isCoreAudience, profileGenreFit } from '@/lib/dossier';
import { isSteamLinked, type GeoSummary, type Row } from '@/lib/testerInsights';
import GeoDistributionMap from '@/components/charts/GeoDistributionMap';
import ov from '@/components/overview/overview.module.css';
import s from './testers.module.css';

interface Props {
  testers: Tester[];
  geo: GeoSummary;
  config: GameConfig;
  targets?: string[];
}

interface Kpi { label: string; value: string; unit?: string; note: string; info?: string }

/** Top countries fill two columns; past ten, the last slot becomes "+N more". */
const COUNTRY_SLOTS = 10;
const LANGUAGE_SLOTS = 5;

function KpiCell({ label, value, unit, note, info }: Kpi) {
  return (
    <div className={`${s.kpiCell} groove-cell`}>
      <div className={ov.kpiLabel} title={info}>{label}</div>
      <div className={`${ov.kpiValue} ${s.kpiValue}`} title={value}>
        {value}{unit && <span className={ov.kpiUnit}>{unit}</span>}
      </div>
      <div className={ov.kpiSub} title={note}>{note}</div>
    </div>
  );
}

function ContinentRows({ rows }: { rows: Row[] }) {
  return (
    <div role="img" aria-label={`Testers by continent: ${rows.map(r => `${r.label} ${r.count}`).join(', ')}`}>
      {rows.map(r => (
        <div key={r.label} className={`${s.contRow} groove-b-soft`}>
          <span className={s.rowName} title={r.label}>{r.label}</span>
          <span className={ov.bar} aria-hidden="true">
            <span className={`${ov.barFill} ${s.gradientFill}`} style={{ width: `${Math.max(2, r.pct)}%` }} />
          </span>
          <span className={s.rowCount}>{r.count}</span>
        </div>
      ))}
    </div>
  );
}

function CountryList({ rows }: { rows: Row[] }) {
  const overflow = rows.length > COUNTRY_SLOTS;
  const shown = overflow ? rows.slice(0, COUNTRY_SLOTS - 1) : rows;
  const slots = shown.length + (overflow ? 1 : 0);
  return (
    // Column-first flow, so the ranking reads down the first column, then the second.
    <div className={s.countryList} style={{ gridTemplateRows: `repeat(${Math.ceil(slots / 2)}, auto)`, gridAutoFlow: 'column' }}>
      {shown.map(r => (
        <div key={r.label} className={`${s.countryRow} groove-b-soft`}>
          <span className={s.rowName} title={r.label}>{r.label}</span>
          <span className={s.rowCount}>{r.count}</span>
        </div>
      ))}
      {overflow && <div className={`${s.moreRow} groove-b-soft`}>+{rows.length - shown.length} more</div>}
    </div>
  );
}

export default function TesterOverviewTab({ testers, geo, config, targets }: Props) {
  const kpis = useMemo(() => {
    const total = testers.length;
    const profiled = testers.filter(t => t.inRegistry === true || Object.keys(t.segments).length > 0).length;
    const topContinent = geo.continents.find(r => r.label !== 'Unknown');
    const topCountry = geo.countries[0];
    const hasTargets = (targets ?? config.targetGenres?.map(g => g.label) ?? []).length > 0;
    const linked = testers.filter(isSteamLinked).length;

    const list: Kpi[] = [{ label: 'Participating testers', value: String(total), note: `${profiled} with profile data` }];
    if (topContinent) list.push({ label: 'Top region', value: topContinent.label, note: `${topContinent.count} testers · ${topContinent.pct}%` });
    if (topCountry) list.push({ label: 'Top country', value: topCountry.label, note: `${topCountry.count} testers · ${topCountry.pct}%` });
    if (hasTargets && linked > 0) {
      list.push({
        label: 'Core audience',
        value: String(testers.filter(t => isCoreAudience(t, config, targets)).length),
        unit: `/${linked}`,
        note: `${CORE_AUDIENCE_HOURS}h+ on Steam · plays a target genre`,
        info: `Steam-linked testers who play one of this test's target genres and have ${CORE_AUDIENCE_HOURS}+ hours on Steam. Steam reports total hours, not hours per genre.`,
      });
    } else if (hasTargets) {
      list.push({
        label: 'Target-genre players',
        value: String(testers.filter(t => profileGenreFit(t, config, targets).value === 'Target genre').length),
        unit: `/${total}`,
        note: 'No Steam data · 0 linked libraries',
      });
    }
    return list;
  }, [testers, geo, config, targets]);

  const languages = geo.languages.slice(0, LANGUAGE_SLOTS).map(r => `${r.label} ${r.count}`);
  const moreLanguages = geo.languages.length - LANGUAGE_SLOTS;

  return (
    <>
      <div className="groove-b">
        <div className={s.kpiRow}>
          {kpis.map(k => <KpiCell key={k.label} {...k} />)}
        </div>
      </div>

      <section className={`${s.geo} groove-b`} aria-labelledby="geo-label">
        <div className={ov.sectionHead}>
          <h2 id="geo-label" className={ov.sectionLabel}>Geographic spread</h2>
          {geo.countries.length > 0 && (
            <span className={s.sectionMeta}>
              {geo.countries.length} {geo.countries.length === 1 ? 'country' : 'countries'} · {geo.continentCount} {geo.continentCount === 1 ? 'continent' : 'continents'} · hover the map for counts
            </span>
          )}
        </div>

        {geo.countries.length === 0 ? (
          <p className={s.muted}>No location data · 0 of {testers.length} testers shared a country</p>
        ) : (
          <div className={s.geoRow}>
            <div className={`${s.mapCol} groove-cell`}>
              <GeoDistributionMap data={geo.countries} />
            </div>
            <div className={`${s.sideCol} groove-cell`}>
              <div>
                <div className={s.blockLabel}>By continent</div>
                <ContinentRows rows={geo.continents} />
              </div>
              <div>
                <div className={s.blockLabel}>Top countries</div>
                <CountryList rows={geo.countries} />
              </div>
              {languages.length > 0 && (
                <div>
                  <div className={s.blockLabel}>Languages</div>
                  <p className={s.languages}>
                    {languages.join(' · ')}{moreLanguages > 0 && ` · +${moreLanguages}`}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </>
  );
}
