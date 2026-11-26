import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useFetch } from '../useFetch.js';
import { Card, Status } from '../components/ui.jsx';
import ClassPicker, { classReady } from '../components/ClassPicker.jsx';
import { Feedback, useSaver } from '../components/forms.jsx';

// Move students to the next semester, a class at a time. Untick anyone who is detained.
export default function Promote() {
  const meta = useFetch('/meta');
  const [cls, setCls] = useState({ courseId: '', departmentId: '', semester: '', section: '' });
  const [picked, setPicked] = useState([]);
  const s = useSaver();
  const ready = meta.data && classReady(meta.data, cls);
  const qs = new URLSearchParams({ courseId: cls.courseId, semester: cls.semester, ...(cls.departmentId ? { departmentId: cls.departmentId } : {}), ...(cls.section ? { section: cls.section } : {}) }).toString();
  const list = useFetch(ready ? `/structure/promote?${qs}` : null);

  useEffect(() => { if (list.data) setPicked(list.data.students.map((x) => x.id)); }, [list.data]);
  const toggle = (id) => setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]);

  const run = () => {
    if (!window.confirm(`Move ${picked.length} student(s) to: ${list.data.next}? This cannot be undone.`)) return;
    s.run(async () => {
      const d = await api('/structure/promote', { method: 'POST', body: { studentIds: picked } });
      s.setOk(`${d.promoted} promoted, ${d.passedOut} passed out.`);
      list.reload();
    });
  };

  return (
    <>
      <h1>Promote students</h1>
      <Card title="Choose the class" note="Promotion is semester by semester. Do it when a semester ends.">
        <Status loading={meta.loading} error={meta.error}>
          {meta.data && <div className="form-grid"><ClassPicker meta={meta.data} value={cls} onChange={setCls} withSection optional /></div>}
        </Status>
      </Card>
      {ready && (
        <Status loading={list.loading} error={list.error}>
          {list.data && (
            <Card title={`${list.data.students.length} students`} note={`They move to: ${list.data.next}`}>
              {list.data.students.length === 0 ? <p className="state">No active students in this class.</p> : (
                <>
                  <div className="toolbar">
                    <button type="button" className="btn ghost" onClick={() => setPicked(list.data.students.map((x) => x.id))}>Select all</button>
                    <button type="button" className="btn ghost" onClick={() => setPicked([])}>Select none</button>
                  </div>
                  <div className="table-wrap scroll-y">
                    <table className="tbl">
                      <thead><tr><th /><th>Enrollment No</th><th>Name</th><th>Sec</th></tr></thead>
                      <tbody>
                        {list.data.students.map((x) => (
                          <tr key={x.id}>
                            <td className="narrow-cell"><input type="checkbox" className="plain-check" aria-label={`Promote ${x.name}`} checked={picked.includes(x.id)} onChange={() => toggle(x.id)} /></td>
                            <td>{x.enrollmentNo}</td><td>{x.name}</td><td>{x.section}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Feedback error={s.error} ok={s.ok} />
                  <button className="btn" onClick={run} disabled={s.busy || picked.length === 0}>{list.data.next === 'Passes out' ? `Mark ${picked.length} as passed out` : `Promote ${picked.length} to ${list.data.next}`}</button>
                </>
              )}
            </Card>
          )}
        </Status>
      )}
    </>
  );
}
