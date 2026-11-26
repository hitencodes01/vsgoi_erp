import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fmtDate, pct } from './ui.jsx';

const tick = { fill: 'var(--mute)', fontSize: 12 };
const tip = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--ink)' };

export function TrendChart({ data, xKey, formatX = fmtDate }) {
  const hasData = data.some((d) => d.rate !== null);
  if (!hasData) return <p className="state">No attendance recorded in this period yet.</p>;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
        <XAxis dataKey={xKey} tickFormatter={formatX} tick={tick} stroke="var(--line)" minTickGap={24} />
        <YAxis domain={[0, 100]} unit="%" tick={tick} stroke="var(--line)" />
        <Tooltip contentStyle={tip} formatter={(v) => [pct(v), 'Attendance']} labelFormatter={formatX} />
        <Line type="monotone" dataKey="rate" stroke="var(--accent)" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}

// Bars turn red below the threshold so weak spots stand out.
export function RateBars({ data, xKey, threshold = 75 }) {
  if (!data.some((d) => d.rate !== null)) return <p className="state">No attendance recorded yet.</p>;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
        <XAxis dataKey={xKey} tick={tick} stroke="var(--line)" />
        <YAxis domain={[0, 100]} unit="%" tick={tick} stroke="var(--line)" />
        <Tooltip contentStyle={tip} cursor={{ fill: 'var(--line)', opacity: 0.4 }} formatter={(v) => [pct(v), 'Attendance']} />
        <ReferenceLine y={threshold} stroke="var(--err)" strokeDasharray="4 4" />
        <Bar dataKey="rate" radius={[4, 4, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.rate !== null && d.rate < threshold ? 'var(--err)' : 'var(--accent)'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function RankList({ items, highlightId }) {
  if (!items.length) return <p className="state">No data yet.</p>;
  return (
    <ol className="rank">
      {items.map((it, i) => (
        <li key={it.teacherId} className={it.teacherId === highlightId ? 'me' : ''}>
          <span className="pos">{i + 1}</span>
          <span className="who">
            {it.name}
            <small>{it.employeeCode} · {it.lecturesHeld} lectures held</small>
          </span>
          <strong>{pct(it.rate)}</strong>
          <span className="bar"><i style={{ width: `${it.rate}%` }} /></span>
        </li>
      ))}
    </ol>
  );
}
