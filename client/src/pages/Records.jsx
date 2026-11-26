import { useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { useFetch } from '../useFetch.js';
import { Card, Kpi, Status, StatusBadge, fmtDate, pct, toneFor } from '../components/ui.jsx';

export default function Records() {
  const { user } = useAuth();
  const [f, setF] = useState({ assignmentId: '', status: '', from: '', to: '' });
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  const { data, loading, error } = useFetch(`/attendance/records?${qs}`);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const showStudent = user.role !== 'STUDENT';
  const limit = data?.summary.total > data?.records.length;

  return (
    <>
      <h1>{user.role === 'STUDENT' ? 'My attendance' : 'Attendance records'}</h1>
      <Card>
        <div className="filters">
          <label>Subject
            <select value={f.assignmentId} onChange={set('assignmentId')}>
              <option value="">All subjects</option>
              {data?.assignments.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </label>
          <label>Status
            <select value={f.status} onChange={set('status')}>
              <option value="">Any</option><option value="PRESENT">Present</option><option value="ABSENT">Absent</option><option value="LATE">Late</option><option value="EXCUSED">Excused</option>
            </select>
          </label>
          <label>From<input type="date" value={f.from} onChange={set('from')} /></label>
          <label>To<input type="date" value={f.to} onChange={set('to')} /></label>
        </div>
      </Card>

      <Status loading={loading && !data} error={error}>
        {data && (
          <>
            <div className="kpis">
              <Kpi label="Records" value={data.summary.total} />
              <Kpi label="Attendance" value={pct(data.summary.rate)} tone={toneFor(data.summary.rate)} />
              <Kpi label="Present" value={data.summary.PRESENT} />
              <Kpi label="Late" value={data.summary.LATE} />
              <Kpi label="Absent" value={data.summary.ABSENT} />
              <Kpi label="Excused" value={data.summary.EXCUSED} />
            </div>
            <Card title="Records" note={limit ? `Showing the latest ${data.records.length}. Narrow the filters to see others.` : undefined}>
              {data.records.length === 0 ? (
                <p className="state">No records match these filters.</p>
              ) : (
                <div className="table-wrap">
                  <table className="tbl">
                    <thead><tr><th>Date</th>{showStudent && <th>Student</th>}<th>Subject</th><th>Sec</th><th>Status</th></tr></thead>
                    <tbody>
                      {data.records.map((r) => (
                        <tr key={r.id}>
                          <td>{fmtDate(r.date)}</td>
                          {showStudent && <td>{r.studentName} <span className="muted">{r.enrollmentNo}</span></td>}
                          <td>{r.subject}</td>
                          <td>{r.section}</td>
                          <td><StatusBadge status={r.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        )}
      </Status>
    </>
  );
}
