import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { useFetch } from '../useFetch.js';
import { Card, Status } from '../components/ui.jsx';
import LectureList from '../components/LectureList.jsx';

export default function Lectures() {
  const { user } = useAuth();
  const [f, setF] = useState({ from: '', to: '', assignmentId: '' });
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  const { data, loading, error, reload } = useFetch(`/lectures?${qs}`);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const manage = user.role === 'ADMIN' || user.role === 'TEACHER';

  return (
    <>
      <h1>{user.role === 'STUDENT' ? 'Timetable' : user.role === 'TEACHER' ? 'My lectures' : 'Lectures'}</h1>
      <Card title="Schedule" note={f.from || f.to ? undefined : 'Past 7 days and next 14 days'}>
        <div className="filters">
          <label>Subject
            <select value={f.assignmentId} onChange={set('assignmentId')}>
              <option value="">All subjects</option>
              {data?.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </label>
          <label>From<input type="date" value={f.from} onChange={set('from')} /></label>
          <label>To<input type="date" value={f.to} onChange={set('to')} /></label>
          {manage && <Link className="btn grow" to="/lectures/new">Schedule lecture</Link>}
        </div>
        <Status loading={loading && !data} error={error}>
          {data && <LectureList lectures={data.lectures} today={data.today} canMark={manage} canEdit={manage} canSuspend={manage} onChange={reload} showTeacher={user.role !== 'TEACHER'} />}
        </Status>
      </Card>
    </>
  );
}
