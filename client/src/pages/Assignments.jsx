import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useFetch } from '../useFetch.js';
import { Card, Status } from '../components/ui.jsx';
import ClassPicker, { classBody, classReady } from '../components/ClassPicker.jsx';
import { Feedback, useSaver } from '../components/forms.jsx';

// One faculty member per section who looks after the class and keeps its students' details up to date.
function Coordinators({ cls, qs, teachers }) {
  const { data, loading, error, reload } = useFetch(`/structure/coordinators?${qs}`);
  const [cells, setCells] = useState({});
  const s = useSaver();
  useEffect(() => { if (data) setCells(data.assigned); }, [data]);
  const save = () => s.run(async () => {
    await api('/structure/coordinators', { method: 'PUT', body: { ...classBody(cls), items: data.sections.map((sec) => ({ section: sec, teacherId: cells[sec] ? Number(cells[sec]) : null })) } });
    s.setOk('Class coordinators saved.');
    reload();
  });
  return (
    <Card title="Class coordinators" note="A coordinator gets a My class page with the students of that section and can update their contact details.">
      <Status loading={loading && !data} error={error}>
        {data && (
          <>
            <div className="form-grid">
              {data.sections.map((sec) => (
                <div className="field" key={sec}>
                  <label htmlFor={`co-${sec}`}>Section {sec}</label>
                  <select id={`co-${sec}`} value={cells[sec] ?? ''} onChange={(e) => setCells({ ...cells, [sec]: e.target.value })}>
                    <option value="">No coordinator</option>
                    {teachers.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.employeeCode})</option>)}
                  </select>
                </div>
              ))}
            </div>
            <Feedback error={s.error} ok={s.ok} />
            <button className="btn" onClick={save} disabled={s.busy}>{s.busy ? 'Saving…' : 'Save coordinators'}</button>
          </>
        )}
      </Status>
    </Card>
  );
}

// Pick a class (course, department, semester) and choose the faculty for each subject and section.
export default function Assignments() {
  const meta = useFetch('/meta');
  const [cls, setCls] = useState({ courseId: '', departmentId: '', semester: '' });
  const [cells, setCells] = useState({});
  const s = useSaver();
  const ready = meta.data && classReady(meta.data, cls);
  const qs = new URLSearchParams({ courseId: cls.courseId, semester: cls.semester, ...(cls.departmentId ? { departmentId: cls.departmentId } : {}) }).toString();
  const grid = useFetch(ready ? `/structure/assignments?${qs}` : null);

  useEffect(() => {
    if (!grid.data) return;
    const c = {};
    for (const sub of grid.data.subjects) for (const sec of grid.data.sections) c[`${sub.id}-${sec}`] = String(sub.assigned[sec] ?? '');
    setCells(c);
  }, [grid.data]);

  const save = () => s.run(async () => {
    const items = grid.data.subjects.flatMap((sub) => grid.data.sections.map((sec) => ({ subjectId: sub.id, section: sec, teacherId: cells[`${sub.id}-${sec}`] ? Number(cells[`${sub.id}-${sec}`]) : null })));
    const d = await api('/structure/assignments', { method: 'PUT', body: { items } });
    s.setOk(`Saved (${d.saved} changes applied).`);
    grid.reload();
  });

  const teachers = meta.data?.teachers ?? [];
  return (
    <>
      <h1>Faculty assignment</h1>
      <Card title="Choose the class" note={meta.data?.session ? `Session ${meta.data.session.name}` : 'Create an academic session first'}>
        <Status loading={meta.loading} error={meta.error}>
          {meta.data && <div className="form-grid"><ClassPicker meta={meta.data} value={cls} onChange={setCls} /></div>}
        </Status>
      </Card>
      {ready && <Coordinators cls={cls} qs={qs} teachers={teachers} />}
      {ready && (
        <Status loading={grid.loading} error={grid.error}>
          {grid.data && (
            <Card title="Subjects and faculty" note="Leave a cell empty if that section has no lectures for the subject.">
              {grid.data.subjects.length === 0 ? (
                <p className="state">This class has no subjects yet. Add them under Subjects.</p>
              ) : (
                <>
                  <div className="table-wrap">
                    <table className="tbl">
                      <thead>
                        <tr><th>Subject</th>{grid.data.sections.map((sec) => <th key={sec}>Section {sec} <span className="muted">({grid.data.counts[sec]} students)</span></th>)}</tr>
                      </thead>
                      <tbody>
                        {grid.data.subjects.map((sub) => (
                          <tr key={sub.id}>
                            <td><strong>{sub.code}</strong> {sub.name}</td>
                            {grid.data.sections.map((sec) => (
                              <td key={sec}>
                                <select aria-label={`${sub.code} section ${sec}`} value={cells[`${sub.id}-${sec}`] ?? ''} onChange={(e) => setCells({ ...cells, [`${sub.id}-${sec}`]: e.target.value })}>
                                  <option value="">Not assigned</option>
                                  {teachers.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.employeeCode})</option>)}
                                </select>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Feedback error={s.error} ok={s.ok} />
                  <button className="btn" onClick={save} disabled={s.busy}>{s.busy ? 'Saving…' : 'Save assignments'}</button>
                </>
              )}
            </Card>
          )}
        </Status>
      )}
    </>
  );
}
