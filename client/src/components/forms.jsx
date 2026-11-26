import { useState } from 'react';

// Small helpers shared by every form screen.
export function useSaver() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  async function run(fn) {
    setBusy(true);
    setError('');
    setOk('');
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, ok, setOk, setError, run };
}

export function Feedback({ error, ok }) {
  return (
    <>
      {error && <div className="msg" role="alert">{error}</div>}
      {ok && <p className="success" role="status">{ok}</p>}
    </>
  );
}

export const numOrNull = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
export const todayStr = () => new Date().toLocaleDateString('en-CA');
