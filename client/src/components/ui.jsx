import { Link } from 'react-router-dom';

export const fmtDate = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });

export const fmtDay = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

export const pct = (v) => (v === null || v === undefined ? '–' : `${v}%`);

export function Card({ title, note, children }) {
  return (
    <section className="panel">
      {(title || note) && (
        <header className="panel-head">
          <h2>{title}</h2>
          {note && <span className="note">{note}</span>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Kpi({ label, value, hint, tone }) {
  return (
    <div className={`kpi ${tone ? `tone-${tone}` : ''}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {hint && <div className="kpi-hint">{hint}</div>}
    </div>
  );
}

export function Status({ loading, error, children }) {
  if (loading) return <p className="state">Loading…</p>;
  if (error) return <p className="state err" role="alert">{error}</p>;
  return children;
}

const LABELS = { PRESENT: 'Present', ABSENT: 'Absent', LATE: 'Late', EXCUSED: 'Excused' };
export const StatusBadge = ({ status }) => <span className={`badge b-${status.toLowerCase()}`}>{LABELS[status]}</span>;

export const toneFor = (rate, low = 75) => (rate === null || rate === undefined ? undefined : rate < low ? 'bad' : rate < low + 10 ? 'warn' : 'good');

export const fmtMoney = (n) => `₹${Number(n ?? 0).toLocaleString('en-IN')}`;

export const fmtFull = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export function Notices({ notices }) {
  if (!notices?.length) return <p className="state">No notices yet.</p>;
  return (
    <ul className="plain-list">
      {notices.map((n) => (
        <li key={n.id}><Link to="/notices">{n.title}</Link><span className="muted">{fmtDate(n.date)}</span></li>
      ))}
    </ul>
  );
}
