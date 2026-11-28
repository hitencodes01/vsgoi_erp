import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useFetch } from '../useFetch.js';
import { Card, Status, fmtDay } from '../components/ui.jsx';

const OPTIONS = [['PRESENT', 'Present'], ['ABSENT', 'Absent'], ['LATE', 'Late'], ['EXCUSED', 'Excused']];

export default function MarkAttendance() {
  const { lectureId } = useParams();
  const navigate = useNavigate();
  const { data, loading, error } = useFetch(`/attendance/lectures/${lectureId}`);
  const [marks, setMarks] = useState({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!data) return;
    const m = {};
    for (const s of data.students) m[s.studentId] = s.status ?? 'PRESENT';
    setMarks(m);
  }, [data]);

  const counts = OPTIONS.map(([k, label]) => [label, Object.values(marks).filter((v) => v === k).length]);

  async function save() {
    setSaving(true);
    setMsg('');
    try {
      await api(`/attendance/lectures/${lectureId}`, {
        method: 'PUT',
        body: { records: Object.entries(marks).map(([id, status]) => ({ studentId: Number(id), status })) },
      });
      navigate('/', { replace: true });
    } catch (e) {
      setMsg(e.message);
      setSaving(false);
    }
  }

  return (
    <Status loading={loading} error={error}>
      {data && (
        <>
          <p><Link to="/lectures">← Back to lectures</Link></p>
          <h1>{data.lecture.subject}</h1>
          <p className="sub">{data.lecture.classLabel} · {fmtDay(data.lecture.date)} · {data.lecture.startTime}–{data.lecture.endTime}{data.lecture.room ? ` · ${data.lecture.room}` : ''}</p>

          {data.lecture.suspended ? (
            <p className="alert">This lecture is suspended{data.lecture.suspendReason ? ` (${data.lecture.suspendReason})` : ''}, so attendance can’t be marked. Resume it from the lectures list first.</p>
          ) : !data.lecture.editable ? (
            <p className="alert">This lecture is in the future, so attendance can’t be marked yet.</p>
          ) : data.students.length === 0 ? (
            <p className="alert">No active students are in this class yet.</p>
          ) : (
            <Card title={`${data.students.length} students`} note={data.lecture.alreadyMarked ? 'Editing saved attendance' : 'Everyone starts as present. Change the exceptions.'}>
              <div className="toolbar">
                <button className="btn ghost" onClick={() => setMarks(Object.fromEntries(data.students.map((s) => [s.studentId, 'PRESENT'])))}>Mark all present</button>
                <span className="muted">{counts.map(([l, n]) => `${l} ${n}`).join(' · ')}</span>
              </div>
              <div className="table-wrap">
                <table className="tbl">
                  <thead><tr><th>Enrollment No</th><th>Name</th><th>Status</th></tr></thead>
                  <tbody>
                    {data.students.map((s) => (
                      <tr key={s.studentId}>
                        <td>{s.enrollmentNo}</td>
                        <td>{s.name}</td>
                        <td>
                          <div className="seg" role="radiogroup" aria-label={`Attendance for ${s.name}`}>
                            {OPTIONS.map(([k, label]) => (
                              <button key={k} type="button" role="radio" aria-checked={marks[s.studentId] === k}
                                className={`seg-${k.toLowerCase()} ${marks[s.studentId] === k ? 'on' : ''}`}
                                onClick={() => setMarks({ ...marks, [s.studentId]: k })}>{label}</button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="msg" role="alert">{msg}</div>
              <button className="btn" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save attendance'}</button>
            </Card>
          )}
        </>
      )}
    </Status>
  );
}
