import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { fmtDay } from './ui.jsx';

// canSuspend + onChange: admin and faculty can suspend or resume a lecture; onChange reloads the list afterwards.
export default function LectureList({ lectures, today, canMark, canEdit, canSuspend, onChange, showTeacher = true }) {
  const [error, setError] = useState('');
  if (!lectures.length) return <p className="state">No lectures in this period.</p>;

  async function toggle(l) {
    setError('');
    let reason;
    if (!l.suspended) {
      reason = window.prompt('Why is this lecture suspended? (optional, students will see it)');
      if (reason === null) return;
    } else if (!window.confirm('Resume this lecture?')) return;
    try {
      await api(`/lectures/${l.id}/suspend`, { method: 'PATCH', body: { suspended: !l.suspended, reason: reason ?? undefined } });
      onChange?.();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <>
      {error && <div className="msg" role="alert">{error}</div>}
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Date</th><th>Time</th><th>Subject</th><th>Class</th>{showTeacher && <th>Faculty</th>}<th>Room</th>
              {canMark && <th>Attendance</th>}
              {(canEdit || canSuspend) && <th />}
            </tr>
          </thead>
          <tbody>
            {lectures.map((l) => {
              const showSuspend = canSuspend && !(l.marked && !l.suspended); // attendance already taken: it cannot be suspended
              return (
              <tr key={l.id} className={`${l.date === today ? 'today' : ''} ${l.suspended ? 'suspended' : ''}`}>
                <td>{fmtDay(l.date)}{l.date === today && <span className="pill">Today</span>}</td>
                <td>{l.startTime}–{l.endTime}</td>
                <td>
                  {l.subject}
                  {l.suspended && <> <span className="badge s-suspended">Suspended</span>{l.suspendReason && <div className="muted">{l.suspendReason}</div>}</>}
                </td>
                <td>{l.classLabel}</td>
                {showTeacher && <td>{l.teacher}</td>}
                <td>{l.room || '–'}</td>
                {canMark && (
                  <td>
                    {l.suspended ? (
                      <span className="muted">Suspended</span>
                    ) : l.date > today ? (
                      <span className="muted">Not yet</span>
                    ) : (
                      <Link className={`btn ${l.marked ? 'ghost' : ''}`} to={`/attendance/mark/${l.id}`}>{l.marked ? 'Edit' : 'Mark attendance'}</Link>
                    )}
                  </td>
                )}
                {(canEdit || canSuspend) && (
                  <td>
                    {canEdit && <Link to={`/lectures/${l.id}/edit`}>Edit</Link>}
                    {canEdit && showSuspend && ' · '}
                    {showSuspend && <button type="button" className="link" onClick={() => toggle(l)}>{l.suspended ? 'Resume' : 'Suspend'}</button>}
                  </td>
                )}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
