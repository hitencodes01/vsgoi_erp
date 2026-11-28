import { useFetch } from '../../useFetch.js';
import { Card, Kpi, Notices, Status, pct, toneFor } from '../../components/ui.jsx';
import { RankList, RateBars, TrendChart } from '../../components/charts.jsx';
import LectureList from '../../components/LectureList.jsx';

export default function FacultyDashboard() {
  const { data: d, loading, error, reload } = useFetch('/dashboard/faculty');
  return (
    <Status loading={loading} error={error}>
      {d && (
        <>
          <h1>Faculty dashboard</h1>
          <p className="sub">{d.session ? `Session ${d.session}` : 'No academic session is active yet.'}</p>
          <div className="kpis">
            <Kpi label="Lectures today" value={d.kpis.lecturesToday} />
            <Kpi label="Attendance to mark" value={d.kpis.pendingMarking} tone={d.kpis.pendingMarking ? 'warn' : 'good'} hint="Today and the past 7 days" />
            <Kpi label="My subjects" value={d.kpis.subjects} />
            <Kpi label="Class attendance" value={pct(d.kpis.overallRate)} tone={toneFor(d.kpis.overallRate, d.threshold)} />
            <Kpi label="Faculty rank" value={d.kpis.rank ? `#${d.kpis.rank}` : '–'} hint={d.kpis.rank ? `of ${d.kpis.facultyCount}` : undefined} />
          </div>
          <Card title="My lectures" note="Past 7 days and next 7 days">
            <LectureList lectures={d.lectures} today={d.today} canMark canSuspend onChange={reload} showTeacher={false} />
          </Card>
          <div className="grid2">
            <Card title="Class attendance, last 30 days"><TrendChart data={d.trend} xKey="date" /></Card>
            <Card title="Attendance by subject" note={`Red line = ${d.threshold}%`}><RateBars data={d.subjects} xKey="code" threshold={d.threshold} /></Card>
          </div>
          <div className="grid2">
            <Card title="Top faculty" note="Average attendance in their classes"><RankList items={d.topFaculty} highlightId={d.myTeacherId} /></Card>
            <Card title="Notices"><Notices notices={d.notices} /></Card>
          </div>
        </>
      )}
    </Status>
  );
}
