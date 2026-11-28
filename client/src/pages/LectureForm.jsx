import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useFetch } from '../useFetch.js';
import { Card, Status } from '../components/ui.jsx';
import { Feedback, numOrNull, useSaver } from '../components/forms.jsx';

export default function LectureForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const options = useFetch('/lectures/options');
  const existing = useFetch(editing ? `/lectures/${id}` : null);
  const [form, setForm] = useState({ assignmentId: '', date: '', startTime: '09:00', endTime: '10:00', room: '', topic: '', repeatWeeks: '0' });
  const [marked, setMarked] = useState(false);
  const suspended = Boolean(existing.data?.item?.suspended);
  const s = useSaver();

  useEffect(() => {
    const it = existing.data?.item;
    if (!it) return;
    setForm({ assignmentId: it.assignmentId, date: it.date, startTime: it.startTime, endTime: it.endTime, room: it.room, topic: it.topic, repeatWeeks: '0' });
    setMarked(it.marked);
  }, [existing.data]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const body = () => ({
    assignmentId: numOrNull(form.assignmentId) ?? undefined, date: form.date, startTime: form.startTime, endTime: form.endTime,
    room: form.room, topic: form.topic, ...(editing ? {} : { repeatWeeks: Number(form.repeatWeeks) || 0 }),
  });

  const submit = (e) => {
    e.preventDefault();
    s.run(async () => {
      if (editing) {
        await api(`/lectures/${id}`, { method: 'PUT', body: body() });
        s.setOk('Changes saved.');
      } else {
        await api('/lectures', { method: 'POST', body: body() });
        navigate('/lectures');
      }
    });
  };
  const remove = () => {
    if (!window.confirm('Delete this lecture?')) return;
    s.run(async () => {
      await api(`/lectures/${id}`, { method: 'DELETE' });
      navigate('/lectures');
    });
  };

  return (
    <>
      <p><Link to="/lectures">← Back to lectures</Link></p>
      <h1>{editing ? 'Edit lecture' : 'Schedule lecture'}</h1>
      <Status loading={options.loading || existing.loading} error={options.error || existing.error}>
        {options.data && (
          <Card>
            {options.data.options.length === 0 && <p className="alert">No subjects are assigned yet. An admin must assign faculty to subjects first (Faculty assignment).</p>}
            <form onSubmit={submit} noValidate>
              {suspended && <p className="alert">This lecture is suspended. Resume it from the lectures list when it is back on.</p>}
              {marked && <p className="alert">Attendance is already marked, so the subject and date are locked. You can still change the time, room or topic.</p>}
              <div className="form-grid">
                <div className="field wide"><label htmlFor="assign">Subject and class</label>
                  <select id="assign" value={form.assignmentId} onChange={set('assignmentId')} disabled={marked}>
                    <option value="">Choose…</option>
                    {options.data.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                </div>
                <div className="field"><label htmlFor="date">Date</label><input id="date" type="date" value={form.date} onChange={set('date')} disabled={marked} /></div>
                <div className="field"><label htmlFor="start">Starts</label><input id="start" type="time" value={form.startTime} onChange={set('startTime')} /></div>
                <div className="field"><label htmlFor="end">Ends</label><input id="end" type="time" value={form.endTime} onChange={set('endTime')} /></div>
                <div className="field"><label htmlFor="room">Room</label><input id="room" value={form.room} onChange={set('room')} /></div>
                <div className="field"><label htmlFor="topic">Topic (optional)</label><input id="topic" value={form.topic} onChange={set('topic')} /></div>
                {!editing && (
                  <div className="field"><label htmlFor="rep">Repeat weekly for</label>
                    <select id="rep" value={form.repeatWeeks} onChange={set('repeatWeeks')}>
                      <option value="0">Just this once</option>
                      {[4, 8, 12, 16, 20].map((n) => <option key={n} value={n}>{n} more weeks</option>)}
                    </select>
                    <div className="hint">Same weekday and time each week. Nothing is saved if any week clashes.</div>
                  </div>
                )}
              </div>
              <Feedback error={s.error} ok={s.ok} />
              <div className="toolbar">
                <button className="btn" disabled={s.busy}>{s.busy ? 'Saving…' : editing ? 'Save changes' : 'Schedule'}</button>
                <Link className="btn ghost" to="/lectures">Cancel</Link>
                {editing && <button type="button" className="btn danger" onClick={remove} disabled={s.busy}>Delete</button>}
              </div>
            </form>
          </Card>
        )}
      </Status>
    </>
  );
}
