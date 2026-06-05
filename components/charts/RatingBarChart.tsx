'use client';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';

const COLORS: Record<number, string> = {
  1: '#ef4444',
  2: '#f97316',
  3: '#eab308',
  4: '#22c55e',
  5: '#10b981',
};

const COLORS_10: Record<number, string> = {
  1: '#ef4444', 2: '#ef4444', 3: '#ef4444', 4: '#f97316',
  5: '#eab308', 6: '#eab308', 7: '#eab308',
  8: '#22c55e', 9: '#10b981', 10: '#10b981',
};

interface RatingBarChartProps {
  data: { value: number; count: number; pct: number }[];
  scale?: 5 | 10;
  onBarClick?: (value: number) => void;
}

export default function RatingBarChart({ data, scale = 5, onBarClick }: RatingBarChartProps) {
  const colorMap = scale === 10 ? COLORS_10 : COLORS;

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: -20 }}>
        <XAxis
          dataKey="value"
          tick={{ fill: '#94a3b8', fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: '#64748b', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: 'rgba(255,255,255,0.04)' }}
          contentStyle={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '8px',
            fontSize: '12px',
          }}
          labelStyle={{ color: '#94a3b8' }}
          itemStyle={{ color: '#e2e8f0' }}
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
            <Cell key={entry.value} fill={colorMap[entry.value] ?? '#6366f1'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
