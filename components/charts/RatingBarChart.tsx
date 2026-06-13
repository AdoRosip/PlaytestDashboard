'use client';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';

const COLORS: Record<number, string> = {
  1: '#0000EE',
  2: '#003DF5',
  3: '#0066FF',
  4: '#00B8FF',
  5: '#00FFFF',
};

const COLORS_10: Record<number, string> = {
  1: '#0000EE', 2: '#001EF1', 3: '#003DF5', 4: '#0054FA',
  5: '#0066FF', 6: '#0084FF', 7: '#00A2FF',
  8: '#00C0FF', 9: '#00E0FF', 10: '#00FFFF',
};

interface RatingBarChartProps {
  data: { value: number; count: number; pct: number }[];
  scale?: 5 | 10;
  onBarClick?: (value: number) => void;
}

export default function RatingBarChart({ data, scale = 5, onBarClick }: RatingBarChartProps) {
  const colorMap = scale === 10 ? COLORS_10 : COLORS;

  return (
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
          cursor={{ fill: 'rgba(255,255,255,0.04)' }}
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
          onClick={onBarClick ? (_barData: unknown, index: number) => {
            const rating = data[index]?.value;
            if (rating !== undefined) onBarClick(rating);
          } : undefined}
        >
          {data.map((entry) => (
            <Cell key={entry.value} fill={colorMap[entry.value] ?? '#0066FF'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
