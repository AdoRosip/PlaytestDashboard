'use client';
import { useMemo, useRef, useState } from 'react';
import { geoNaturalEarth1, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import worldTopo from 'world-atlas/countries-110m.json';
import { COUNTRY_CODE_TO_CONTINENT } from '@/lib/countryContinents';

interface ContinentRow {
  label: string;
  count: number;
  pct: number;
}

interface Props {
  data: ContinentRow[];
}

// ── One-time geometry prep (runs once at module load) ────────────────────────
const VIEW_W = 980;
const VIEW_H = 480;

interface CountryShape {
  d: string;
  continent: string;
  name: string;
}

const COUNTRY_SHAPES: CountryShape[] = (() => {
  // topojson/world-atlas are loosely typed; cast through unknown locally.
  const topo = worldTopo as unknown as Parameters<typeof feature>[0];
  const fc = feature(topo, (topo as { objects: Record<string, unknown> }).objects.countries as never) as unknown as {
    features: { id: string | number; properties: { name?: string } }[];
  };

  // Keep only countries we can attribute to a continent (drops Antarctica and a
  // handful of uninhabited territories) — also gives a clean projection fit.
  const usable = fc.features.filter((f) => COUNTRY_CODE_TO_CONTINENT[Number(f.id)]);

  const projection = geoNaturalEarth1().fitExtent(
    [[8, 8], [VIEW_W - 8, VIEW_H - 8]],
    { type: 'FeatureCollection', features: usable } as never,
  );
  const path = geoPath(projection);

  return usable.map((f) => ({
    d: path(f as never) ?? '',
    continent: COUNTRY_CODE_TO_CONTINENT[Number(f.id)],
    name: f.properties?.name ?? '',
  }));
})();

// ── Colour ramp: dim blue → bright cyan as the count approaches the max ──────
function fillForCount(count: number, max: number): string {
  if (count <= 0) return 'rgba(148,163,184,0.08)'; // faint slate base
  const t = max > 0 ? count / max : 0;
  const g = Math.round(102 + (255 - 102) * t);
  const opacity = 0.3 + 0.55 * t;
  return `rgba(0,${g},255,${opacity})`;
}

export default function GeoDistributionMap({ data }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ continent: string; x: number; y: number } | null>(null);

  const { byContinent, maxCount, hasAny } = useMemo(() => {
    const map = new Map<string, ContinentRow>();
    let max = 0;
    let any = false;
    for (const row of data) {
      if (row.label === 'Unknown') continue;
      map.set(row.label, row);
      if (row.count > max) max = row.count;
      if (row.count > 0) any = true;
    }
    return { byContinent: map, maxCount: max, hasAny: any };
  }, [data]);

  const hoveredRow = hover ? byContinent.get(hover.continent) : null;

  function handleMove(continent: string, e: React.MouseEvent) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHover({ continent, x: e.clientX - rect.left, y: e.clientY - rect.top });
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full aspect-[2/1] min-h-[300px] rounded-xl border border-indigo-500/30 bg-[#0B1021] overflow-hidden"
      onMouseLeave={() => setHover(null)}
    >
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="absolute inset-0 h-full w-full" role="img" aria-label="Tester distribution by continent">
        <defs>
          <radialGradient id="geoGlow" cx="50%" cy="45%" r="75%">
            <stop offset="0%" stopColor="rgba(0,255,255,0.10)" />
            <stop offset="60%" stopColor="rgba(0,102,255,0.05)" />
            <stop offset="100%" stopColor="rgba(11,16,33,0)" />
          </radialGradient>
        </defs>
        <rect width={VIEW_W} height={VIEW_H} fill="url(#geoGlow)" />

        {COUNTRY_SHAPES.map((shape, i) => {
          const row = byContinent.get(shape.continent);
          const count = row?.count ?? 0;
          const isHovered = hover?.continent === shape.continent;
          const dimmed = hover && !isHovered;
          return (
            <path
              key={i}
              d={shape.d}
              fill={fillForCount(count, maxCount)}
              stroke={isHovered ? '#00FFFF' : 'rgba(0,255,255,0.15)'}
              strokeWidth={isHovered ? 1.1 : 0.4}
              opacity={dimmed ? 0.55 : 1}
              style={{ cursor: count > 0 ? 'pointer' : 'default', transition: 'opacity 120ms' }}
              onMouseMove={(e) => handleMove(shape.continent, e)}
              onMouseEnter={(e) => handleMove(shape.continent, e)}
            />
          );
        })}
      </svg>

      {!hasAny && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-500">
          No location data for this tester set
        </div>
      )}

      {hover && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 shadow-xl"
          style={{
            left: Math.min(hover.x + 12, VIEW_W),
            top: hover.y + 12,
            transform: hover.x > (containerRef.current?.clientWidth ?? VIEW_W) - 120 ? 'translateX(-100%)' : undefined,
          }}
        >
          <div className="text-xs font-semibold text-white">{hover.continent}</div>
          <div className="text-[11px] text-[#00FFFF] font-bold">
            {hoveredRow?.count ?? 0} tester{(hoveredRow?.count ?? 0) !== 1 ? 's' : ''}
            {hoveredRow && hoveredRow.count > 0 && (
              <span className="text-slate-500 font-normal"> · {hoveredRow.pct}%</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
