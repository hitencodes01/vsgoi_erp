import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import AuthShell from '../components/AuthShell.jsx';
import PasswordField, { PASSWORD_RULE, passwordProblem } from '../components/PasswordField.jsx';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function sendCode(e) {
    e?.preventDefault();
    setError('');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Enter a valid email address.');
    setBusy(true);
    try {
      const d = await api('/auth/forgot', { method: 'POST', body: { email: email.trim() } });
      setInfo(d.message);
      setStep('reset');
      setCooldown(60);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(e) {
    e.preventDefault();
    setError('');
    if (!/^\d{6}$/.test(otp)) return setError('Enter the 6-digit code from your email.');
    const problem = passwordProblem(pw);
    if (problem) return setError(problem);
    if (pw !== pw2) return setError('The two passwords do not match.');
    setBusy(true);
    try {
      const d = await api('/auth/reset', { method: 'POST', body: { email: email.trim(), otp, newPassword: pw } });
      navigate('/login', { replace: true, state: { notice: d.message } });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  if (step === 'email') {
    return (
      <AuthShell title="Forgot password" subtitle="Enter your college email and we will send you a 6-digit code.">
        <form onSubmit={sendCode} noValidate>
          <div className="field">
            <label htmlFor="fp-email">Email</label>
            <input id="fp-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="msg" role="alert">{error}</div>
          <button className="submit" disabled={busy}>{busy ? 'Sending…' : 'Send code'}</button>
          <div className="linkrow center"><Link to="/login">Back to sign in</Link></div>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Reset password" subtitle={`Enter the code sent to ${email.trim()} and choose a new password.`}>
      <form onSubmit={resetPassword} noValidate>
        {info && <p className="success" role="status">{info}</p>}
        <div className="field">
          <label htmlFor="otp">6-digit code</label>
          <input id="otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} />
        </div>
        <PasswordField id="np" label="New password" value={pw} onChange={setPw} autoComplete="new-password" hint={PASSWORD_RULE} />
        <PasswordField id="np2" label="Confirm new password" value={pw2} onChange={setPw2} autoComplete="new-password" />
        <div className="msg" role="alert">{error}</div>
        <button className="submit" disabled={busy}>{busy ? 'Saving…' : 'Reset password'}</button>
        <div className="linkrow center">
          <button type="button" className="link" disabled={cooldown > 0 || busy} onClick={sendCode}>
            {cooldown > 0 ? `Send a new code in ${cooldown}s` : 'Send a new code'}
          </button>
        </div>
        <div className="linkrow center"><Link to="/login">Back to sign in</Link></div>
      </form>
    </AuthShell>
  );
}
