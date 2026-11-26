import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { useFetch } from '../useFetch.js';
import { Card, Kpi, Status, fmtFull, fmtMoney } from '../components/ui.jsx';
import ClassPicker from '../components/ClassPicker.jsx';
import { Feedback, numOrNull, todayStr, useSaver } from '../components/forms.jsx';
import ListPage from './ListPage.jsx';

const MODES = ['Cash', 'UPI', 'Card', 'Bank transfer', 'Cheque'];
const pill = (v) => `badge s-${v.toLowerCase()}`;

// /fees is the fee register for admins and "my fees" for students.
export function FeesRoute() {
  const { user } = useAuth();
  if (user.role === 'TEACHER') return <Navigate to="/" replace />;
  return user.role === 'ADMIN' ? <ListPage kind="fees" /> : <MyFees />;
}

function MyFees() {
  const { data, loading, error } = useFetch('/fees/mine');
  return (
    <>
      <h1>Fees</h1>
      <Status loading={loading} error={error}>
        {data && (
          <>
            <div className="kpis">
              <Kpi label="Total" value={fmtMoney(data.summary.total)} />
              <Kpi label="Paid" value={fmtMoney(data.summary.paid)} tone="good" />
              <Kpi label="Balance" value={fmtMoney(data.summary.due)} tone={data.summary.due ? 'warn' : 'good'} />
            </div>
            {data.demands.length === 0 && <p className="state">No fees have been added for you yet.</p>}
            {data.demands.map((d) => (
              <Card key={d.id} title={d.title} note={`${d.session} · due ${fmtFull(d.dueDate)}`}>
                <p><span className={pill(d.status)}>{d.status}</span> &nbsp; {fmtMoney(d.paid)} paid of {fmtMoney(d.amount)}{d.balance > 0 ? ` · ${fmtMoney(d.balance)} left` : ''}</p>
                {d.payments.length > 0 && (
                  <div className="table-wrap">
                    <table className="tbl">
                      <thead><tr><th>Paid on</th><th>Amount</th><th>Mode</th><th>Reference</th></tr></thead>
                      <tbody>{d.payments.map((p) => <tr key={p.id}><td>{fmtFull(p.paidOn)}</td><td>{fmtMoney(p.amount)}</td><td>{p.mode}</td><td>{p.reference || '–'}</td></tr>)}</tbody>
                    </table>
                  </div>
                )}
              </Card>
            ))}
            <p className="muted">To pay, contact the college accounts office. Payments appear here once they are recorded.</p>
          </>
        )}
      </Status>
    </>
  );
}

// Create the same fee for a whole class (course, optionally department / semester / section).
export function FeeDemandForm() {
  const navigate = useNavigate();
  const meta = useFetch('/meta');
  const [form, setForm] = useState({ title: '', amount: '', dueDate: '', courseId: '', departmentId: '', semester: '', section: '' });
  const s = useSaver();
  const submit = (e) => {
    e.preventDefault();
    s.run(async () => {
      const d = await api('/fees/demands', {
        method: 'POST',
        body: { title: form.title, amount: Number(form.amount), dueDate: form.dueDate, courseId: numOrNull(form.courseId) ?? undefined, departmentId: numOrNull(form.departmentId), semester: numOrNull(form.semester), section: form.section || null },
      });
      s.setOk(`${d.created} fee entries created.`);
      setTimeout(() => navigate('/fees'), 1200);
    });
  };
  return (
    <>
      <p><Link to="/fees">← Back to fees</Link></p>
      <h1>New fee</h1>
      <Status loading={meta.loading} error={meta.error}>
        {meta.data && (
          <Card title="Who pays this fee?" note="Choose a course, then narrow it down if needed. Every active student in the selection gets this fee.">
            <form onSubmit={submit} noValidate>
              <div className="form-grid">
                <div className="field"><label htmlFor="t">Fee title</label><input id="t" value={form.title} placeholder="Tuition fee 2026-27" onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
                <div className="field"><label htmlFor="a">Amount (₹)</label><input id="a" type="number" min="1" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
                <div className="field"><label htmlFor="d">Due date</label><input id="d" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></div>
                <ClassPicker meta={meta.data} value={form} onChange={(v) => setForm({ ...form, ...v })} withSection optional />
              </div>
              <Feedback error={s.error} ok={s.ok} />
              <div className="toolbar">
                <button className="btn" disabled={s.busy}>{s.busy ? 'Creating…' : 'Create fee for these students'}</button>
                <Link className="btn ghost" to="/fees">Cancel</Link>
              </div>
            </form>
          </Card>
        )}
      </Status>
    </>
  );
}

// One student's fee: edit it, record payments, remove a wrong payment.
export function FeeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useFetch(`/fees/demands/${id}`);
  const [form, setForm] = useState({ title: '', amount: '', dueDate: '' });
  const [pay, setPay] = useState({ amount: '', paidOn: todayStr(), mode: 'Cash', reference: '' });
  const a = useSaver();
  const b = useSaver();

  useEffect(() => {
    if (!data) return;
    setForm({ title: data.item.title, amount: String(data.item.amount), dueDate: data.item.dueDate });
    setPay((p) => ({ ...p, amount: data.item.balance > 0 ? String(data.item.balance) : '' }));
  }, [data]);

  const saveDemand = (e) => {
    e.preventDefault();
    a.run(async () => { await api(`/fees/demands/${id}`, { method: 'PUT', body: { title: form.title, amount: Number(form.amount), dueDate: form.dueDate } }); a.setOk('Saved.'); reload(); });
  };
  const addPayment = (e) => {
    e.preventDefault();
    b.run(async () => { await api(`/fees/demands/${id}/payments`, { method: 'POST', body: { amount: Number(pay.amount), paidOn: pay.paidOn, mode: pay.mode, reference: pay.reference } }); b.setOk('Payment recorded.'); reload(); });
  };
  const removePayment = (pid) => {
    if (!window.confirm('Remove this payment?')) return;
    b.run(async () => { await api(`/fees/payments/${pid}`, { method: 'DELETE' }); reload(); });
  };
  const removeDemand = () => {
    if (!window.confirm('Delete this fee?')) return;
    a.run(async () => { await api(`/fees/demands/${id}`, { method: 'DELETE' }); navigate('/fees'); });
  };

  const it = data?.item;
  return (
    <>
      <p><Link to="/fees">← Back to fees</Link></p>
      <h1>Fee details</h1>
      <Status loading={loading && !data} error={error}>
        {it && (
          <>
            <p className="sub">{it.student.name} · {it.student.enrollmentNo} · {it.student.classLabel}</p>
            <div className="kpis">
              <Kpi label="Amount" value={fmtMoney(it.amount)} />
              <Kpi label="Paid" value={fmtMoney(it.paid)} tone="good" />
              <Kpi label="Balance" value={fmtMoney(it.balance)} tone={it.balance ? 'warn' : 'good'} hint={it.status} />
            </div>
            <Card title="Fee">
              <form onSubmit={saveDemand} noValidate>
                <div className="form-grid">
                  <div className="field"><label htmlFor="t">Title</label><input id="t" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
                  <div className="field"><label htmlFor="a">Amount (₹)</label><input id="a" type="number" min="1" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
                  <div className="field"><label htmlFor="d">Due date</label><input id="d" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></div>
                </div>
                <Feedback error={a.error} ok={a.ok} />
                <div className="toolbar">
                  <button className="btn" disabled={a.busy}>Save</button>
                  <button type="button" className="btn danger" onClick={removeDemand} disabled={a.busy}>Delete fee</button>
                </div>
              </form>
            </Card>
            <Card title="Payments">
              {it.payments.length === 0 ? <p className="state">No payments yet.</p> : (
                <div className="table-wrap">
                  <table className="tbl">
                    <thead><tr><th>Paid on</th><th>Amount</th><th>Mode</th><th>Reference</th><th /></tr></thead>
                    <tbody>{it.payments.map((p) => (
                      <tr key={p.id}><td>{fmtFull(p.paidOn)}</td><td>{fmtMoney(p.amount)}</td><td>{p.mode}</td><td>{p.reference || '–'}</td>
                        <td><button type="button" className="link" onClick={() => removePayment(p.id)} disabled={b.busy}>Remove</button></td></tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
              {it.balance > 0 && (
                <form onSubmit={addPayment} noValidate>
                  <h3 className="subhead">Record a payment</h3>
                  <div className="form-grid">
                    <div className="field"><label htmlFor="pa">Amount (₹)</label><input id="pa" type="number" min="1" max={it.balance} value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></div>
                    <div className="field"><label htmlFor="po">Paid on</label><input id="po" type="date" max={todayStr()} value={pay.paidOn} onChange={(e) => setPay({ ...pay, paidOn: e.target.value })} /></div>
                    <div className="field"><label htmlFor="pm">Mode</label><select id="pm" value={pay.mode} onChange={(e) => setPay({ ...pay, mode: e.target.value })}>{MODES.map((m) => <option key={m}>{m}</option>)}</select></div>
                    <div className="field"><label htmlFor="pr">Reference (optional)</label><input id="pr" value={pay.reference} placeholder="Receipt or transaction no." onChange={(e) => setPay({ ...pay, reference: e.target.value })} /></div>
                  </div>
                  <Feedback error={b.error} ok={b.ok} />
                  <button className="btn" disabled={b.busy}>Record payment</button>
                </form>
              )}
              {it.balance === 0 && <Feedback error={b.error} ok={b.ok} />}
            </Card>
          </>
        )}
      </Status>
    </>
  );
}
