import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { useFetch } from '../useFetch.js';
import { Card, Status, fmtDate } from '../components/ui.jsx';
import PasswordField, { PASSWORD_RULE, passwordProblem } from '../components/PasswordField.jsx';

const FIELDS = ['phone', 'city', 'address', 'dateOfBirth', 'emergencyContactName', 'emergencyContactPhone', 'bio'];

export default function Settings() {
  const { user, updateToken, markPasswordChanged } = useAuth();
  const { data, loading, error } = useFetch('/account');
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState({ ok: '', err: '' });

  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState({ ok: '', err: '' });

  useEffect(() => {
    if (data) setForm(Object.fromEntries(FIELDS.map((k) => [k, data.profile[k]])));
  }, [data]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function saveProfile(e) {
    e.preventDefault();
    setSaving(true);
    setProfileMsg({ ok: '', err: '' });
    try {
      await api('/account', { method: 'PUT', body: form });
      setProfileMsg({ ok: 'Your details have been saved.', err: '' });
    } catch (err) {
      setProfileMsg({ ok: '', err: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(e) {
    e.preventDefault();
    setPwMsg({ ok: '', err: '' });
    if (!pw.current) return setPwMsg({ ok: '', err: 'Enter your current password.' });
    const problem = passwordProblem(pw.next);
    if (problem) return setPwMsg({ ok: '', err: problem });
    if (pw.next !== pw.confirm) return setPwMsg({ ok: '', err: 'The two new passwords do not match.' });
    setPwBusy(true);
    try {
      const d = await api('/account/password', { method: 'POST', body: { currentPassword: pw.current, newPassword: pw.next } });
      updateToken(d.token);
      markPasswordChanged();
      setPw({ current: '', next: '', confirm: '' });
      setPwMsg({ ok: d.message, err: '' });
    } catch (err) {
      setPwMsg({ ok: '', err: err.message });
    } finally {
      setPwBusy(false);
    }
  }

  const p = data?.profile;
  return (
    <>
      <h1>Settings</h1>
      {user.mustChangePassword && (
        <p className="alert" role="status">Choose a new password to continue. The rest of the app stays locked until you do. Your current password is the temporary one you were given.</p>
      )}
      <Status loading={loading} error={error}>
        {p && form && (
          <>
            <Card title="Your account" note="To change your name or email, contact an administrator.">
              <dl className="facts">
                <div><dt>Name</dt><dd>{p.name}</dd></div>
                <div><dt>Email</dt><dd>{p.email}</dd></div>
                <div><dt>Role</dt><dd className="cap">{p.role.toLowerCase()}</dd></div>
                {p.enrollmentNo && <div><dt>Enrollment No</dt><dd>{p.enrollmentNo}</dd></div>}
                {p.course && <div><dt>Course</dt><dd>{p.course}</dd></div>}
                {p.department && <div><dt>Department</dt><dd>{p.department}</dd></div>}
                {p.semester && <div><dt>Semester · Section</dt><dd>{p.semester} · {p.section}</dd></div>}
                {p.employeeCode && <div><dt>Employee code</dt><dd>{p.employeeCode}</dd></div>}
                <div><dt>Member since</dt><dd>{fmtDate(p.memberSince)}</dd></div>
              </dl>
            </Card>

            <Card title="Personal details">
              <form onSubmit={saveProfile} noValidate>
                <div className="form-grid">
                  <div className="field"><label htmlFor="phone">Phone</label><input id="phone" type="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} /></div>
                  <div className="field"><label htmlFor="dob">Date of birth</label><input id="dob" type="date" autoComplete="bday" value={form.dateOfBirth} onChange={set('dateOfBirth')} /></div>
                  <div className="field"><label htmlFor="city">City</label><input id="city" value={form.city} onChange={set('city')} /></div>
                  <div className="field"><label htmlFor="address">Address</label><input id="address" autoComplete="street-address" value={form.address} onChange={set('address')} /></div>
                  <div className="field"><label htmlFor="ecn">Emergency contact name</label><input id="ecn" value={form.emergencyContactName} onChange={set('emergencyContactName')} /></div>
                  <div className="field"><label htmlFor="ecp">Emergency contact phone</label><input id="ecp" type="tel" value={form.emergencyContactPhone} onChange={set('emergencyContactPhone')} /></div>
                </div>
                <div className="field">
                  <label htmlFor="bio">About you</label>
                  <textarea id="bio" rows={4} maxLength={500} value={form.bio} onChange={set('bio')} />
                  <div className="hint">{form.bio.length}/500</div>
                </div>
                {profileMsg.err && <div className="msg" role="alert">{profileMsg.err}</div>}
                {profileMsg.ok && <p className="success" role="status">{profileMsg.ok}</p>}
                <button className="btn" disabled={saving}>{saving ? 'Saving…' : 'Save details'}</button>
              </form>
            </Card>

            <Card title="Change password" note="Other devices are signed out when you change it.">
              <form onSubmit={changePassword} noValidate className="narrow">
                <PasswordField id="cp" label="Current password" value={pw.current} onChange={(v) => setPw({ ...pw, current: v })} autoComplete="current-password" />
                <PasswordField id="npw" label="New password" value={pw.next} onChange={(v) => setPw({ ...pw, next: v })} autoComplete="new-password" hint={PASSWORD_RULE} />
                <PasswordField id="npw2" label="Confirm new password" value={pw.confirm} onChange={(v) => setPw({ ...pw, confirm: v })} autoComplete="new-password" />
                {pwMsg.err && <div className="msg" role="alert">{pwMsg.err}</div>}
                {pwMsg.ok && <p className="success" role="status">{pwMsg.ok}</p>}
                <button className="btn" disabled={pwBusy}>{pwBusy ? 'Changing…' : 'Change password'}</button>
                <p className="muted">Forgot your current password? Sign out and use “Forgot password?” on the sign-in page to get a code by email.</p>
              </form>
            </Card>
          </>
        )}
      </Status>
    </>
  );
}
