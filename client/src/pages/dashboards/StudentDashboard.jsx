import { Link } from 'react-router-dom';
import { useFetch } from '../../useFetch.js';
import { Card, Kpi, Notices, Status, StatusBadge, fmtDate, fmtMoney, pct, toneFor } from '../../components/ui.jsx';
import { RateBars, TrendChart } from '../../components/charts.jsx';
import LectureList from '../../components/LectureList.jsx';

export default function StudentDashboard() {
  const { data: d, loading, error } = useFetch('/dashboard/student');
  const low = d ? d.subjects.filter((c) => c.rate !== null && c.rate < d.threshold) : [];
  return (
    <Status loading={loading} error={error}>
      {d && (
        <>
          <h1>My dashboard</h1>
          <p className="sub">{d.student.enrollmentNo} · {d.student.classLabel}</p>
          {low.length > 0 && <p className="alert" role="status">Your attendance is below {d.threshold}% in {low.map((c) => c.code).join(', ')}.</p>}
          <div className="kpis">
            <Kpi label="Attendance" value={pct(d.kpis.overallRate)} tone={toneFor(d.kpis.overallRate, d.threshold)} />
            <Kpi label="Present" value={d.kpis.present} />
            <Kpi label="Late" value={d.kpis.late} />
            <Kpi label="Absent" value={d.kpis.absent} tone={d.kpis.absent ? 'warn' : undefined} />
            <Kpi label="Subjects" value={d.kpis.subjects} />
            <Kpi label="Fees due" value={fmtMoney(d.kpis.feesDue)} tone={d.kpis.feesDue ? 'warn' : 'good'} />
          </div>
          <div className="grid2">
            <Card title="Attendance by subject" note={`Red line = ${d.threshold}%`}><RateBars data={d.subjects} xKey="code" threshold={d.threshold} /></Card>
            <Card title="Weekly attendance" note="Last 8 weeks"><TrendChart data={d.weekly} xKey="week" /></Card>
          </div>
          <Card title="Subject summary">
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Subject</th><th>Faculty</th><th>Attended</th><th>Attendance</th></tr></thead>
                <tbody>
                  {d.subjects.map((c) => (
                    <tr key={c.code}>
                      <td><strong>{c.code}</strong> {c.title}</td><td>{c.faculty}</td><td>{c.attended} / {c.total}</td>
                      <td className={c.rate !== null && c.rate < d.threshold ? 'bad' : ''}>{pct(c.rate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {d.subjects.length === 0 && <p className="state">No subjects are assigned to your class yet.</p>}
          </Card>
          <div className="grid2">
            <Card title="Recent records">
              <div className="table-wrap">
                <table className="tbl">
                  <thead><tr><th>Date</th><th>Subject</th><th>Status</th></tr></thead>
                  <tbody>{d.recent.map((r) => <tr key={r.id}><td>{fmtDate(r.date)}</td><td>{r.subject}</td><td><StatusBadge status={r.status} /></td></tr>)}</tbody>
                </table>
              </div>
              <p><Link to="/records">See all records</Link></p>
            </Card>
            <Card title="Upcoming lectures" note="Next 7 days"><LectureList lectures={d.upcoming} today={d.today} /></Card>
          </div>
          <Card title="Notices"><Notices notices={d.notices} /></Card>
        </>
      )}
    </Status>
  );
}
