'use client';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';

import { useTouchTooltip } from './useTouchTooltip';

interface ChoiceBarChartProps {
  data: { label: string; count: number; pct: number }[];
  onBarClick?: (label: string) => void;
  // Selected bars stay emphasized while unselected bars are dimmed.
  selectedValues?: string[];
}

// One neutral hue: yes/no and multiple-choice options are nominal, so the
// rating chart's red→green polarity ramp would claim "Yes" is good and "No" bad.
const BAR_COLOR = '#00FFFF';
const ROW_HEIGHT = 34;

// Short option sets (yes/no, a few one-word choices) read as columns, matching
// the rating chart beside them. Longer labels don't fit under a column, so those
// questions switch to horizontal bars with the label on the left.
const fitsColumns = (data: ChoiceBarChartProps['data']) =>
  data.length <= 6 && data.every((d) => d.label.length <= 12);

const truncate = (label: string, max: number) =>
  label.length > max ? `${label.slice(0, max - 1)}…` : label;

export default function ChoiceBarChart({ data, onBarClick, selectedValues }: ChoiceBarChartProps) {
  const { wrapperProps, tooltipActive } = useTouchTooltip();
  const selectionActive = Boolean(selectedValues?.length);
  const columns = fitsColumns(data);
  const tick = { fill: 'rgba(255,255,255,0.72)', fontSize: 12 };
  const valueTick = { fill: 'rgba(255,255,255,0.42)', fontSize: 11 };

  return (
    <div {...wrapperProps}>
    <ResponsiveContainer width="100%" height={columns ? 200 : Math.max(120, data.length * ROW_HEIGHT + 24)} minWidth={0}>
      <BarChart
        data={data}
        layout={columns ? 'horizontal' : 'vertical'}
        margin={columns ? { top: 4, right: 4, bottom: 4, left: -20 } : { top: 4, right: 12, bottom: 4, left: 0 }}
      >
        {columns ? (
          <>
            <XAxis dataKey="label" tick={tick} axisLine={false} tickLine={false} interval={0} />
            <YAxis tick={valueTick} axisLine={false} tickLine={false} allowDecimals={false} />
          </>
        ) : (
          <>
            <XAxis type="number" tick={valueTick} axisLine={false} tickLine={false} allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="label"
              width={156}
              tick={tick}
              tickFormatter={(label: string) => truncate(label, 20)}
              axisLine={false}
              tickLine={false}
              interval={0}
            />
          </>
        )}
        <Tooltip
          active={tooltipActive}
          cursor={false}
          separator=""
          contentStyle={{
            background: '#0B1021',
            border: '1px solid rgba(0, 255, 255, 0.32)',
            borderRadius: '8px',
            fontSize: '12px',
            maxWidth: 280,
            whiteSpace: 'normal',
          }}
          labelStyle={{ color: '#00FFFF' }}
          itemStyle={{ color: '#FFF' }}
          formatter={(value, _name, props) => [
            `${value ?? ''} responses (${(props as { payload: { pct: number } }).payload.pct}%)`,
            '',
          ]}
        />
        <Bar
          dataKey="count"
          radius={columns ? [4, 4, 0, 0] : [0, 4, 4, 0]}
          maxBarSize={columns ? 72 : 22}
          cursor={onBarClick ? 'pointer' : 'default'}
          // As in RatingBarChart: a transparent background makes the whole
          // band clickable, and the label is read from the payload because
          // recharts' index skips zero-count bars.
          background={onBarClick ? { fill: 'transparent', stroke: 'none', cursor: 'pointer' } : false}
          onClick={onBarClick ? (barData: unknown) => {
            const label = (barData as { payload?: { label?: string } } | undefined)?.payload?.label;
            if (typeof label === 'string') onBarClick(label);
          } : undefined}
        >
          {data.map((entry) => (
            <Cell
              key={entry.label}
              fill={BAR_COLOR}
              fillOpacity={!selectionActive || selectedValues?.includes(entry.label) ? 0.85 : 0.2}
              stroke="none"
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
    </div>
  );
}
