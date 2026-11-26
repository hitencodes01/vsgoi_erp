import { Link } from 'react-router-dom';
import { useFetch } from '../../useFetch.js';
import { Card, Kpi, Notices, Status, fmtMoney, pct, toneFor } from '../../components/ui.jsx';
import { RankList, RateBars, TrendChart } from '../../components/charts.jsx';

export default function AdminDashboard() {
  const { data: d, loading, error } = useFetch('/dashboard/admin');
  return (
    <Status loading={loading} error={error}>
      {d && (
        <>
          <h1>Admin dashboard</h1>
          <p className="sub">{d.session ? `Session ${d.session}` : 'No academic session yet. Create one under Session & settings.'}</p>
          <div className="kpis">
            <Kpi label="Active students" value={d.kpis.students} />
            <Kpi label="Faculty" value={d.kpis.faculty} />
            <Kpi label="Lectures today" value={d.kpis.lecturesToday} />
            <Kpi label="Overall attendance" value={pct(d.kpis.overallRate)} tone={toneFor(d.kpis.overallRate, d.threshold)} />
            <Kpi label={`Students below ${d.threshold}%`} value={d.kpis.lowStudents} tone={d.kpis.lowStudents ? 'bad' : 'good'} />
            <Kpi label="Fees pending" value={fmtMoney(d.kpis.feesDue)} tone={d.kpis.feesDue ? 'warn' : 'good'} />
          </div>
          <div className="grid2">
            <Card title="Attendance, last 14 days"><TrendChart data={d.trend} xKey="date" /></Card>
            <Card title="Attendance by course" note={`Red line = ${d.threshold}%`}><RateBars data={d.courses} xKey="code" threshold={d.threshold} /></Card>
          </div>
          <div className="grid2">
            <Card title="Top faculty" note="Average attendance in their classes"><RankList items={d.topFaculty} /></Card>
            <Card title="Notices"><Notices notices={d.notices} /><p><Link to="/notices/new">Post a notice</Link></p></Card>
          </div>
          <Card title="Quick links">
            <div className="shortcuts">
              <Link to="/import">Import students</Link><Link to="/students/new">Add student</Link><Link to="/faculty/new">Add faculty</Link>
              <Link to="/assignments">Faculty assignment</Link><Link to="/lectures/new">Schedule lecture</Link><Link to="/fees/new">New fee</Link>
              <Link to="/promote">Promote students</Link><Link to="/session">Session & settings</Link>
            </div>
          </Card>
        </>
      )}
    </Status>
  );
}
