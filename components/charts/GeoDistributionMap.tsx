'use client';
import { useMemo, useRef, useState } from 'react';
import { geoNaturalEarth1, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import worldTopo from 'world-atlas/countries-110m.json';
import s from '@/components/testers/testers.module.css';

interface CountryRow {
  label: string;
  count: number;
}

interface Props {
  /** Testers per country, keyed by the free-text country names testers give. */
  data: CountryRow[];
}

// ── One-time geometry prep (runs once at module load) ────────────────────────
// The view box matches the 1.9 aspect ratio of the map frame.
const VIEW_W = 980;
const VIEW_H = 516;

interface CountryShape {
  d: string;
  name: string;
  /** Lowercased atlas name, used to join tester countries onto shapes. */
  key: string;
}

const COUNTRY_SHAPES: CountryShape[] = (() => {
  // topojson/world-atlas are loosely typed; cast through unknown locally.
  const topo = worldTopo as unknown as Parameters<typeof feature>[0];
  const fc = feature(topo, (topo as { objects: Record<string, unknown> }).objects.countries as never) as unknown as {
    features: { id?: string | number; properties: { name?: string } }[];
  };
  const usable = fc.features.filter((f) => f.properties?.name && f.properties.name !== 'Antarctica');
  const projection = geoNaturalEarth1().fitExtent(
    [[4, 4], [VIEW_W - 4, VIEW_H - 4]],
    { type: 'FeatureCollection', features: usable } as never,
  );
  const path = geoPath(projection);
  return usable.map((f) => ({
    d: path(f as never) ?? '',
    name: f.properties.name!,
    key: f.properties.name!.toLowerCase(),
  }));
})();

// Free-text spellings → world-atlas names (lowercased).
const ALIASES: Record<string, string> = {
  usa: 'united states of america', us: 'united states of america', 'u.s.': 'united states of america',
  'u.s.a.': 'united states of america', 'united states': 'united states of america', america: 'united states of america',
  uk: 'united kingdom', 'u.k.': 'united kingdom', 'great britain': 'united kingdom', britain: 'united kingdom',
  england: 'united kingdom', scotland: 'united kingdom', wales: 'united kingdom', 'northern ireland': 'united kingdom',
  'czech republic': 'czechia', 'russian federation': 'russia',
  korea: 'south korea', 'republic of korea': 'south korea', 'korea, republic of': 'south korea',
  'bosnia and herzegovina': 'bosnia and herz.', 'dominican republic': 'dominican rep.',
  'north macedonia': 'macedonia', 'ivory coast': "côte d'ivoire", "cote d'ivoire": "côte d'ivoire",
  uae: 'united arab emirates', holland: 'netherlands', 'the netherlands': 'netherlands',
  türkiye: 'turkey', turkiye: 'turkey', 'viet nam': 'vietnam', swaziland: 'eswatini',
  'democratic republic of the congo': 'dem. rep. congo', 'dr congo': 'dem. rep. congo',
  'central african republic': 'central african rep.', 'south sudan': 's. sudan',
};

function atlasKey(country: string): string {
  const key = country.trim().toLowerCase();
  return ALIASES[key] ?? key;
}

// ── Colour scale: #0B4FC4 at the smallest count → #00FFFF at the largest ─────
const LOW = [0x0b, 0x4f, 0xc4];
const HIGH = [0x00, 0xff, 0xff];
const EMPTY = 'rgba(255,255,255,.07)';

function scale(count: number, min: number, max: number): string {
  if (count <= 0) return EMPTY;
  const t = max > min ? (count - min) / (max - min) : 1;
  const [r, g, b] = LOW.map((lo, i) => Math.round(lo + (HIGH[i] - lo) * t));
  return `rgb(${r},${g},${b})`;
}

export default function GeoDistributionMap({ data }: Props) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ name: string; count: number; x: number; y: number; flip: boolean } | null>(null);

  const { counts, min, max } = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of data) {
      const key = atlasKey(row.label);
      counts.set(key, (counts.get(key) ?? 0) + row.count);
    }
    const onMap = COUNTRY_SHAPES.map((shape) => counts.get(shape.key) ?? 0).filter((n) => n > 0);
    return { counts, min: onMap.length ? Math.min(...onMap) : 0, max: onMap.length ? Math.max(...onMap) : 0 };
  }, [data]);

  const summary = useMemo(
    () => [...data].sort((a, b) => b.count - a.count).slice(0, 8).map((r) => `${r.label} ${r.count}`).join(', '),
    [data],
  );

  function handleMove(shape: CountryShape, count: number, e: React.MouseEvent) {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    setHover({ name: shape.name, count, x, y: e.clientY - rect.top, flip: x > rect.width - 140 });
  }

  return (
    <div>
      <div ref={frameRef} className={s.mapFrame} onMouseLeave={() => setHover(null)}>
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className={s.mapSvg}
          role="img"
          aria-label={summary ? `Testers per country: ${summary}` : 'No country data for this tester set'}
        >
          {COUNTRY_SHAPES.map((shape) => {
            const count = counts.get(shape.key) ?? 0;
            const hovered = hover?.name === shape.name;
            return (
              <path
                key={shape.key}
                d={shape.d}
                fill={scale(count, min, max)}
                stroke={hovered ? '#00FFFF' : '#0B1021'}
                strokeWidth={hovered ? 1.2 : 0.5}
                onMouseEnter={(e) => handleMove(shape, count, e)}
                onMouseMove={(e) => handleMove(shape, count, e)}
              />
            );
          })}
        </svg>

        {hover && (
          <div
            className={s.mapTip}
            style={{ left: hover.x + 12, top: hover.y + 12, transform: hover.flip ? 'translateX(calc(-100% - 24px))' : undefined }}
          >
            <div className={s.mapTipName}>{hover.name}</div>
            <div className={s.mapTipCount}>{hover.count} tester{hover.count === 1 ? '' : 's'}</div>
          </div>
        )}
      </div>

      {max > 0 && (
        <div className={s.mapLegend}>
          <span>Testers per country</span>
          <span className={s.mapLegendNum}>{min}</span>
          <span className={s.mapLegendBar} style={{ background: `linear-gradient(90deg, ${scale(min, min, max)}, ${scale(max, min, max)})` }} aria-hidden="true" />
          <span className={s.mapLegendNum}>{max}</span>
        </div>
      )}
    </div>
  );
}
