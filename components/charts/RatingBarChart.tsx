'use client';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';

import { ratingColors } from '@/lib/chartColors';

interface RatingBarChartProps {
  data: { value: number; count: number; pct: number }[];
  scale?: 5 | 10;
  onBarClick?: (value: number) => void;
  // Selected bars stay emphasized while unselected bars are dimmed.
  selectedValues?: number[];
  // Negative-valence questions ("how frustrated were you?") invert what a high
  // rating means. The bars carry a red→green polarity ramp, so without this the
  // chart would paint the good answers red. Raw values arrive un-flipped —
  // `normalizedScore` is corrected in lib/scoring.ts, but this data is not.
  isInverseScored?: boolean;
}

export default function RatingBarChart({
  data, scale = 5, onBarClick, selectedValues, isInverseScored = false,
}: RatingBarChartProps) {
  const colors = ratingColors(scale, isInverseScored);
  const colorFor = (value: number) => colors[value - 1] ?? colors[0];
  const selectionActive = Boolean(selectedValues?.length);

  return (
    <>
    <ResponsiveContainer width="100%" height={200} minWidth={0}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: -20 }}>
        <XAxis
          dataKey="value"
          tick={{ fill: 'rgba(255,255,255,0.72)', fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: 'rgba(255,255,255,0.42)', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={false}
          contentStyle={{
            background: '#0B1021',
            border: '1px solid rgba(0, 255, 255, 0.32)',
            borderRadius: '8px',
            fontSize: '12px',
          }}
          labelStyle={{ color: '#00FFFF' }}
          itemStyle={{ color: '#FFF' }}
          formatter={(value, _name, props) => [
            `${value ?? ''} responses (${(props as { payload: { pct: number } }).payload.pct}%)`,
            '',
          ]}
          labelFormatter={(label) => `Rating: ${label}`}
        />
        <Bar
          dataKey="count"
          radius={[4, 4, 0, 0]}
          cursor={onBarClick ? 'pointer' : 'default'}
          // Recharts sizes each background rectangle to the full plot height and
          // forwards this Bar's events to it. Keeping it transparent makes the
          // whole rating column clickable even when the visible bar is tiny.
          background={onBarClick ? { fill: 'transparent', stroke: 'none', cursor: 'pointer' } : false}
          onClick={onBarClick ? (_barData: unknown, index: number) => {
            const rating = data[index]?.value;
            if (rating !== undefined) onBarClick(rating);
          } : undefined}
        >
          {data.map((entry) => (
            <Cell
              key={entry.value}
              fill={colorFor(entry.value)}
              fillOpacity={!selectionActive || selectedValues?.includes(entry.value) ? 1 : 0.25}
              stroke="none"
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
    {/* Scale legend. It names which end is *good* as well as which is numerically
        high, so the red→green fill is never the only thing carrying that — which
        matters both for colour-vision deficiency and for inverse-scored questions,
        where the green end is the low one. */}
    <div className="flex items-center justify-between px-1 mt-1 text-[11px] text-white/45">
      <span>1 = Lowest · {isInverseScored ? 'best' : 'worst'}</span>
      <span>{scale} = Highest · {isInverseScored ? 'worst' : 'best'}</span>
    </div>
    </>
  );
}
