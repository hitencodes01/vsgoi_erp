import { Link } from 'react-router-dom';
import { fmtDay } from './ui.jsx';

export default function LectureList({ lectures, today, canMark, canEdit, showTeacher = true }) {
  if (!lectures.length) return <p className="state">No lectures in this period.</p>;
  return (
    <div className="table-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>Date</th><th>Time</th><th>Subject</th><th>Class</th>{showTeacher && <th>Faculty</th>}<th>Room</th>
            {canMark && <th>Attendance</th>}
            {canEdit && <th />}
          </tr>
        </thead>
        <tbody>
          {lectures.map((l) => (
            <tr key={l.id} className={l.date === today ? 'today' : ''}>
              <td>{fmtDay(l.date)}{l.date === today && <span className="pill">Today</span>}</td>
              <td>{l.startTime}–{l.endTime}</td>
              <td>{l.subject}</td>
              <td>{l.classLabel}</td>
              {showTeacher && <td>{l.teacher}</td>}
              <td>{l.room || '–'}</td>
              {canMark && (
                <td>
                  {l.date > today ? (
                    <span className="muted">Not yet</span>
                  ) : (
                    <Link className={`btn ${l.marked ? 'ghost' : ''}`} to={`/attendance/mark/${l.id}`}>{l.marked ? 'Edit' : 'Mark attendance'}</Link>
                  )}
                </td>
              )}
              {canEdit && <td><Link to={`/lectures/${l.id}/edit`}>Edit</Link></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
