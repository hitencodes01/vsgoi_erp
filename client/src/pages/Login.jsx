import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import AuthShell from '../components/AuthShell.jsx';
import PasswordField from '../components/PasswordField.jsx';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const notice = useLocation().state?.notice;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) return setError('Enter your email and password.');
    setBusy(true);
    try {
      await login(email.trim(), password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Sign in" subtitle="Use your college email address.">
      <form onSubmit={onSubmit} noValidate>
        {notice && <p className="success" role="status">{notice}</p>}
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <PasswordField id="pw" label="Password" value={password} onChange={setPassword} autoComplete="current-password" />
        <div className="linkrow"><Link to="/forgot-password">Forgot password?</Link></div>
        <div className="msg" role="alert">{error}</div>
        <button className="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </AuthShell>
  );
}
