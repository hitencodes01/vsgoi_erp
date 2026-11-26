import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { useFetch } from '../useFetch.js';
import { Card, Status } from '../components/ui.jsx';
import ClassPicker, { classBody } from '../components/ClassPicker.jsx';
import { Feedback, useSaver } from '../components/forms.jsx';

const CFG = {
  students: { label: 'Student', list: '/students' },
  faculty: { label: 'Faculty member', list: '/faculty' },
  admins: { label: 'Admin', list: '/admins' },
};
const EMPTY = {
  name: '', email: '', aadhaarLast2: '', enrollmentNo: '', employeeCode: '', courseId: '', departmentId: '', semester: '', section: '', status: 'ACTIVE',
  phone: '', alternateContact: '', personalEmail: '', dateOfBirth: '', city: '', address: '', fatherName: '', motherName: '', lastSchool: '', userId: null,
};
const RULE = {
  students: 'Name + course + last 2 digits (Aadhaar if given, otherwise the enrollment number). Branch is not included.',
  faculty: 'Built from the full name; titles like Dr. are left out.',
  admins: 'The first admin is admin@vsgoi.org; more admins get admin2, admin3…',
};

export default function PersonForm({ kind }) {
  const { id } = useParams();
  const editing = Boolean(id);
  const cfg = CFG[kind];
  const { user: me } = useAuth();
  const meta = useFetch('/meta');
  const existing = useFetch(editing ? `/people/${kind}/${id}` : null);
  const [form, setForm] = useState(EMPTY);
  const [active, setActive] = useState(true);
  const [preview, setPreview] = useState(null);
  const [created, setCreated] = useState(null);
  const [tempPw, setTempPw] = useState('');
  const [copied, setCopied] = useState(false);
  const s = useSaver();
  const access = useSaver();

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  useEffect(() => {
    const it = existing.data?.item;
    if (!it) return;
    setForm({ ...EMPTY, ...Object.fromEntries(Object.entries(it).map(([k, v]) => [k, v ?? ''])) });
    setActive(it.active);
  }, [existing.data]);

  // Live preview of the login email while adding someone.
  useEffect(() => {
    if (editing) return;
    const t = setTimeout(() => {
      api('/people/preview-email', {
        method: 'POST',
        body: { kind, name: form.name, courseId: Number(form.courseId) || undefined, enrollmentNo: form.enrollmentNo, aadhaarLast2: form.aadhaarLast2 },
      }).then((d) => setPreview(d.email)).catch(() => setPreview(null));
    }, 350);
    return () => clearTimeout(t);
  }, [editing, kind, form.name, form.courseId, form.enrollmentNo, form.aadhaarLast2]);

  function payload() {
    const body = { name: form.name, phone: form.phone, dateOfBirth: form.dateOfBirth, city: form.city, address: form.address };
    if (editing) body.email = form.email;
    if (kind === 'faculty') body.employeeCode = form.employeeCode;
    if (kind === 'students') {
      Object.assign(body, {
        enrollmentNo: form.enrollmentNo, ...classBody(form), section: form.section, alternateContact: form.alternateContact, personalEmail: form.personalEmail,
        fatherName: form.fatherName, motherName: form.motherName, lastSchool: form.lastSchool,
      });
      if (editing) body.status = form.status;
      else body.aadhaarLast2 = form.aadhaarLast2;
    }
    return body;
  }

  const submit = (e) => {
    e.preventDefault();
    s.run(async () => {
      if (editing) {
        await api(`/people/${kind}/${id}`, { method: 'PUT', body: payload() });
        s.setOk('Changes saved.');
      } else {
        setCreated(await api(`/people/${kind}`, { method: 'POST', body: payload() }));
      }
    });
  };

  const toggleActive = () => access.run(async () => {
    const d = await api(`/people/users/${form.userId}/active`, { method: 'PATCH', body: { active: !active } });
    setActive(d.active);
    access.setOk(d.active ? 'Account reactivated.' : 'Account deactivated. They are signed out and cannot sign in.');
  });
  const resetPassword = () => {
    if (!window.confirm('Reset this password? They will be signed out and given a temporary password.')) return;
    access.run(async () => setTempPw((await api(`/people/users/${form.userId}/reset-password`, { method: 'POST' })).tempPassword));
  };
  const copy = (text) => navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });

  if (created) {
    return (
      <>
        <h1>{cfg.label} added</h1>
        <Card title="Login details" note="Shown only once. Share them privately.">
          <dl className="facts">
            <div><dt>Email</dt><dd>{created.email}</dd></div>
            <div><dt>Temporary password</dt><dd className="mono">{created.tempPassword}</dd></div>
          </dl>
          <p className="muted">They must choose a new password the first time they sign in.</p>
          <div className="toolbar">
            <button className="btn" onClick={() => copy(`Email: ${created.email}\nTemporary password: ${created.tempPassword}`)}>{copied ? 'Copied' : 'Copy login details'}</button>
            <button className="btn ghost" onClick={() => { setCreated(null); setForm(EMPTY); setPreview(null); }}>Add another</button>
            <Link className="btn ghost" to={cfg.list}>Back to list</Link>
          </div>
        </Card>
      </>
    );
  }

  const isSelf = editing && form.userId === me.id;
  const m = meta.data;
  return (
    <>
      <p><Link to={cfg.list}>← Back to list</Link></p>
      <h1>{editing ? `Edit ${cfg.label.toLowerCase()}` : `Add ${cfg.label.toLowerCase()}`}</h1>
      <Status loading={meta.loading || existing.loading} error={meta.error || existing.error}>
        {m && (
          <>
            <Card>
              <form onSubmit={submit} noValidate>
                <div className="form-grid">
                  <div className="field"><label htmlFor="name">Full name</label><input id="name" value={form.name} onChange={set('name')} /></div>
                  {editing ? (
                    <div className="field"><label htmlFor="email">Login email</label><input id="email" type="email" value={form.email} onChange={set('email')} /><div className="hint">Changing this changes how they sign in.</div></div>
                  ) : (
                    <div className="field">
                      <label>Login email (automatic)</label>
                      <div className="preview">{preview ?? <span className="muted">Fill in the fields to see it</span>}</div>
                      <div className="hint">{RULE[kind]}</div>
                    </div>
                  )}
                  {kind === 'faculty' && <div className="field"><label htmlFor="code">Employee code</label><input id="code" value={form.employeeCode} onChange={set('employeeCode')} /></div>}
                  {kind === 'students' && (
                    <>
                      <div className="field"><label htmlFor="enr">Enrollment No</label><input id="enr" value={form.enrollmentNo} onChange={set('enrollmentNo')} /></div>
                      <ClassPicker meta={m} value={form} onChange={(v) => setForm({ ...form, ...v })} withSection />
                      {!editing && (
                        <div className="field">
                          <label htmlFor="aad">Last 2 digits of Aadhaar (optional)</label>
                          <input id="aad" inputMode="numeric" maxLength={2} autoComplete="off" value={form.aadhaarLast2} onChange={(e) => setForm({ ...form, aadhaarLast2: e.target.value.replace(/\D/g, '') })} />
                          <div className="hint">Used only for the email. If empty, the last 2 digits of the enrollment number are used. The full Aadhaar number is never entered or stored.</div>
                        </div>
                      )}
                      {editing && (
                        <div className="field"><label htmlFor="status">Student status</label>
                          <select id="status" value={form.status} onChange={set('status')}><option value="ACTIVE">Active</option><option value="PASSED_OUT">Passed out</option></select>
                        </div>
                      )}
                    </>
                  )}
                  <div className="field"><label htmlFor="phone">Contact No</label><input id="phone" type="tel" value={form.phone} onChange={set('phone')} /></div>
                  {kind === 'students' && <div className="field"><label htmlFor="alt">Alternate Contact</label><input id="alt" type="tel" value={form.alternateContact} onChange={set('alternateContact')} /></div>}
                  {kind === 'students' && <div className="field"><label htmlFor="pe">Personal email</label><input id="pe" type="email" value={form.personalEmail} onChange={set('personalEmail')} /></div>}
                  <div className="field"><label htmlFor="dob">Date of birth</label><input id="dob" type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} /></div>
                  <div className="field"><label htmlFor="city">City</label><input id="city" value={form.city} onChange={set('city')} /></div>
                  <div className="field"><label htmlFor="address">Address</label><input id="address" value={form.address} onChange={set('address')} /></div>
                  {kind === 'students' && (
                    <>
                      <div className="field"><label htmlFor="fn">Father Name</label><input id="fn" value={form.fatherName} onChange={set('fatherName')} /></div>
                      <div className="field"><label htmlFor="mn">Mother Name</label><input id="mn" value={form.motherName} onChange={set('motherName')} /></div>
                      <div className="field"><label htmlFor="ls">Last School Name</label><input id="ls" value={form.lastSchool} onChange={set('lastSchool')} /></div>
                    </>
                  )}
                </div>
                <Feedback error={s.error} ok={s.ok} />
                <div className="toolbar">
                  <button className="btn" disabled={s.busy}>{s.busy ? 'Saving…' : editing ? 'Save changes' : 'Add and create login'}</button>
                  <Link className="btn ghost" to={cfg.list}>Cancel</Link>
                </div>
              </form>
            </Card>

            {editing && (
              <Card title="Account access" note={active ? 'Active' : 'Deactivated'}>
                {tempPw && <p className="success" role="status">Temporary password: <strong className="mono">{tempPw}</strong> (shown once). They must change it at next sign-in.</p>}
                <Feedback error={access.error} ok={access.ok} />
                {isSelf ? (
                  <p className="muted">This is your own account. Use Settings to change your password.</p>
                ) : (
                  <div className="toolbar">
                    <button type="button" className="btn ghost" onClick={resetPassword} disabled={access.busy}>Reset password</button>
                    <button type="button" className="btn ghost" onClick={toggleActive} disabled={access.busy}>{active ? 'Deactivate account' : 'Reactivate account'}</button>
                  </div>
                )}
              </Card>
            )}
          </>
        )}
      </Status>
    </>
  );
}
