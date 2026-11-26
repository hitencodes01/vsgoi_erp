import { useState } from 'react';

export const PASSWORD_RULE = 'Use at least 8 characters, with at least one letter and one number.';

export const passwordProblem = (pw) =>
  pw.length < 8 ? 'Password must be at least 8 characters.'
  : pw.length > 72 ? 'Password can be at most 72 characters.'
  : !/[A-Za-z]/.test(pw) || !/\d/.test(pw) ? 'Password needs at least one letter and one number.'
  : '';

export default function PasswordField({ id, label, value, onChange, autoComplete, hint }) {
  const [show, setShow] = useState(false);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="input-wrap">
        <input id={id} type={show ? 'text' : 'password'} value={value} autoComplete={autoComplete} onChange={(e) => onChange(e.target.value)} />
        <button type="button" className="toggle" aria-pressed={show} onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button>
      </div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}
