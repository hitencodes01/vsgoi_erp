import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useFetch } from '../useFetch.js';
import { Card, Status } from '../components/ui.jsx';
import { Feedback, useSaver } from '../components/forms.jsx';

export function ExamForm() {
  const navigate = useNavigate();
  const list = useFetch('/exams');
  const [form, setForm] = useState({ assignmentId: '', name: '', maxMarks: '30', date: '' });
  const s = useSaver();
  const submit = (e) => {
    e.preventDefault();
    s.run(async () => {
      const d = await api('/exams', { method: 'POST', body: { assignmentId: Number(form.assignmentId) || undefined, name: form.name, maxMarks: Number(form.maxMarks), date: form.date } });
      navigate(`/exams/${d.id}`);
    });
  };
  return (
    <>
      <p><Link to="/exams">← Back to exams</Link></p>
      <h1>New exam</h1>
      <Status loading={list.loading} error={list.error}>
        {list.data && (
          <Card>
            <form onSubmit={submit} noValidate>
              <div className="form-grid">
                <div className="field wide"><label htmlFor="as">Subject and class</label>
                  <select id="as" value={form.assignmentId} onChange={(e) => setForm({ ...form, assignmentId: e.target.value })}>
                    <option value="">Choose…</option>
                    {list.data.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                </div>
                <div className="field"><label htmlFor="n">Exam name</label><input id="n" value={form.name} placeholder="Mid Sem 1" onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div className="field"><label htmlFor="m">Maximum marks</label><input id="m" type="number" min="1" value={form.maxMarks} onChange={(e) => setForm({ ...form, maxMarks: e.target.value })} /></div>
                <div className="field"><label htmlFor="d">Date (optional)</label><input id="d" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
              </div>
              <Feedback error={s.error} />
              <div className="toolbar">
                <button className="btn" disabled={s.busy}>Create and enter marks</button>
                <Link className="btn ghost" to="/exams">Cancel</Link>
              </div>
            </form>
          </Card>
        )}
      </Status>
    </>
  );
}

export function ExamMarks() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useFetch(`/exams/${id}`);
  const [meta, setMeta] = useState({ name: '', maxMarks: '', date: '' });
  const [scores, setScores] = useState({});
  const a = useSaver();
  const b = useSaver();

  useEffect(() => {
    if (!data) return;
    setMeta({ name: data.exam.name, maxMarks: String(data.exam.maxMarks), date: data.exam.date });
    setScores(Object.fromEntries(data.students.map((s) => [s.studentId, s.score === null ? '' : String(s.score)])));
  }, [data]);

  const saveMeta = (e) => {
    e.preventDefault();
    a.run(async () => { await api(`/exams/${id}`, { method: 'PUT', body: { assignmentId: data.exam.assignmentId, name: meta.name, maxMarks: Number(meta.maxMarks), date: meta.date } }); a.setOk('Saved.'); reload(); });
  };
  const saveMarks = () => b.run(async () => {
    const list = Object.entries(scores).map(([sid, v]) => ({ studentId: Number(sid), score: v === '' ? null : Number(v) }));
    if (list.some((x) => x.score !== null && Number.isNaN(x.score))) throw new Error('Marks must be numbers.');
    await api(`/exams/${id}/marks`, { method: 'PUT', body: { scores: list } });
    b.setOk('Marks saved.');
    reload();
  });
  const remove = () => {
    if (!window.confirm('Delete this exam and all its marks?')) return;
    a.run(async () => { await api(`/exams/${id}`, { method: 'DELETE' }); navigate('/exams'); });
  };

  const entered = Object.values(scores).filter((v) => v !== '');
  const avg = entered.length ? Math.round((entered.reduce((x, v) => x + Number(v), 0) / entered.length) * 10) / 10 : null;
  return (
    <>
      <p><Link to="/exams">← Back to exams</Link></p>
      <Status loading={loading && !data} error={error}>
        {data && (
          <>
            <h1>{data.exam.name}</h1>
            <p className="sub">{data.exam.subject} · {data.exam.classLabel}</p>
            <Card title="Exam details">
              <form onSubmit={saveMeta} noValidate>
                <div className="form-grid">
                  <div className="field"><label htmlFor="n">Exam name</label><input id="n" value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} /></div>
                  <div className="field"><label htmlFor="m">Maximum marks</label><input id="m" type="number" min="1" value={meta.maxMarks} onChange={(e) => setMeta({ ...meta, maxMarks: e.target.value })} /></div>
                  <div className="field"><label htmlFor="d">Date</label><input id="d" type="date" value={meta.date} onChange={(e) => setMeta({ ...meta, date: e.target.value })} /></div>
                </div>
                <Feedback error={a.error} ok={a.ok} />
                <div className="toolbar">
                  <button className="btn" disabled={a.busy}>Save details</button>
                  <button type="button" className="btn danger" onClick={remove} disabled={a.busy}>Delete exam</button>
                </div>
              </form>
            </Card>
            <Card title="Marks" note={`${entered.length} of ${data.students.length} entered${avg !== null ? ` · average ${avg} / ${data.exam.maxMarks}` : ''}`}>
              {data.students.length === 0 ? <p className="state">No active students in this class.</p> : (
                <>
                  <div className="table-wrap scroll-y tall">
                    <table className="tbl">
                      <thead><tr><th>Enrollment No</th><th>Name</th><th>Marks (out of {data.exam.maxMarks})</th></tr></thead>
                      <tbody>
                        {data.students.map((s) => (
                          <tr key={s.studentId}>
                            <td>{s.enrollmentNo}</td><td>{s.name}</td>
                            <td><input className="score" type="number" min="0" max={data.exam.maxMarks} step="0.5" aria-label={`Marks for ${s.name}`} value={scores[s.studentId] ?? ''} onChange={(e) => setScores({ ...scores, [s.studentId]: e.target.value })} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Feedback error={b.error} ok={b.ok} />
                  <button className="btn" onClick={saveMarks} disabled={b.busy}>{b.busy ? 'Saving…' : 'Save marks'}</button>
                  <p className="muted">Leave a box empty if the student has no marks (absent).</p>
                </>
              )}
            </Card>
          </>
        )}
      </Status>
    </>
  );
}
