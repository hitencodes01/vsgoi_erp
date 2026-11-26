import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useFetch } from '../useFetch.js';
import { Card, Status } from '../components/ui.jsx';
import { Feedback, useSaver } from '../components/forms.jsx';

export default function SessionSettings() {
  const sessions = useFetch('/structure/sessions');
  const settings = useFetch('/structure/settings');
  const [name, setName] = useState('');
  const [form, setForm] = useState({ attendanceThreshold: '75', passPercent: '40' });
  const a = useSaver();
  const b = useSaver();

  useEffect(() => {
    if (settings.data) setForm({ attendanceThreshold: String(settings.data.settings.attendanceThreshold), passPercent: String(settings.data.settings.passPercent) });
  }, [settings.data]);

  const addSession = (e) => {
    e.preventDefault();
    a.run(async () => { await api('/structure/sessions', { method: 'POST', body: { name } }); setName(''); a.setOk('Session added.'); sessions.reload(); });
  };
  const makeCurrent = (id) => a.run(async () => { await api(`/structure/sessions/${id}/current`, { method: 'PUT' }); a.setOk('Current session changed.'); sessions.reload(); });
  const saveSettings = (e) => {
    e.preventDefault();
    b.run(async () => {
      await api('/structure/settings', { method: 'PUT', body: { attendanceThreshold: Number(form.attendanceThreshold), passPercent: Number(form.passPercent) } });
      b.setOk('Settings saved.');
    });
  };

  return (
    <>
      <h1>Session & settings</h1>
      <Card title="Academic sessions" note="Dashboards, faculty assignment and fees use the current session.">
        <Status loading={sessions.loading} error={sessions.error}>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Session</th><th>Subject assignments</th><th>Status</th><th /></tr></thead>
              <tbody>
                {sessions.data?.rows.map((r) => (
                  <tr key={r.id}>
                    <td><strong>{r.name}</strong></td><td>{r.assignments}</td>
                    <td>{r.current ? <span className="badge s-active">Current</span> : '–'}</td>
                    <td>{!r.current && <button type="button" className="link" onClick={() => makeCurrent(r.id)} disabled={a.busy}>Make current</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Status>
        <form onSubmit={addSession} noValidate className="filters">
          <label>New session<input value={name} placeholder="2027-28" onChange={(e) => setName(e.target.value)} /></label>
          <button className="btn" disabled={a.busy}>Add session</button>
        </form>
        <Feedback error={a.error} ok={a.ok} />
        <p className="muted">After a new session starts, assign faculty to the new semesters’ subjects again (Faculty assignment) and promote students (Promote students).</p>
      </Card>

      <Card title="Rules">
        <form onSubmit={saveSettings} noValidate className="narrow">
          <div className="field"><label htmlFor="thr">Minimum attendance (%)</label><input id="thr" type="number" min="1" max="100" value={form.attendanceThreshold} onChange={(e) => setForm({ ...form, attendanceThreshold: e.target.value })} /><div className="hint">Students below this are flagged on dashboards.</div></div>
          <div className="field"><label htmlFor="pass">Pass marks (%)</label><input id="pass" type="number" min="1" max="100" value={form.passPercent} onChange={(e) => setForm({ ...form, passPercent: e.target.value })} /><div className="hint">Used for pass or fail in results.</div></div>
          <Feedback error={b.error} ok={b.ok} />
          <button className="btn" disabled={b.busy}>Save rules</button>
        </form>
      </Card>
    </>
  );
}
