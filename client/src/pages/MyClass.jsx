import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useFetch } from '../useFetch.js';
import { Card, Status } from '../components/ui.jsx';
import { Feedback, useSaver } from '../components/forms.jsx';

// Faculty who coordinate a class: the students of each of their sections.
export default function MyClass() {
  const { data, loading, error } = useFetch('/coordinator');
  return (
    <>
      <h1>My class</h1>
      <Status loading={loading} error={error}>
        {data && data.classes.length === 0 && <p className="state">You are not a class coordinator in the current session.</p>}
        {data?.classes.map((c) => (
          <Card key={c.id} title={c.label} note={`${c.students.length} students`}>
            {c.students.length === 0 ? <p className="state">No active students in this class yet.</p> : (
              <div className="table-wrap">
                <table className="tbl">
                  <thead><tr><th>Enrollment No</th><th>Name</th><th>Contact</th><th>Father</th><th>Personal email</th><th /></tr></thead>
                  <tbody>
                    {c.students.map((s) => (
                      <tr key={s.id}>
                        <td>{s.enrollmentNo}</td><td>{s.name}</td><td>{s.contact || '–'}</td><td>{s.fatherName || '–'}</td><td>{s.personalEmail || '–'}</td>
                        <td><Link to={`/my-class/students/${s.id}`}>Edit</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        ))}
      </Status>
    </>
  );
}

const FIELDS = [
  ['phone', 'Contact no'], ['alternateContact', 'Alternate contact'], ['personalEmail', 'Personal email'], ['city', 'City'],
  ['fatherName', "Father's name"], ['motherName', "Mother's name"], ['lastSchool', 'Last school'], ['address', 'Address'],
];

// A coordinator can change a student's personal details. Class, status and login stay with the admin.
export function MyClassStudent() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, loading, error } = useFetch(`/coordinator/students/${id}`);
  const [form, setForm] = useState({});
  const s = useSaver();
  useEffect(() => { if (data) setForm(Object.fromEntries(FIELDS.map(([k]) => [k, data.item[k] ?? '']))); }, [data]);

  const submit = (e) => {
    e.preventDefault();
    s.run(async () => {
      await api(`/coordinator/students/${id}`, { method: 'PUT', body: form });
      s.setOk('Saved.');
    });
  };
  return (
    <>
      <p><Link to="/my-class">← Back to my class</Link></p>
      <h1>Student details</h1>
      <Status loading={loading} error={error}>
        {data && (
          <>
            <p className="sub">{data.item.name} · {data.item.enrollmentNo} · {data.item.classLabel}</p>
            <Card>
              <form onSubmit={submit} noValidate>
                <div className="form-grid">
                  {FIELDS.map(([k, label]) => (
                    <div key={k} className={`field ${k === 'address' ? 'wide' : ''}`}>
                      <label htmlFor={`s-${k}`}>{label}</label>
                      <input id={`s-${k}`} value={form[k] ?? ''} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
                    </div>
                  ))}
                </div>
                <Feedback error={s.error} ok={s.ok} />
                <div className="toolbar">
                  <button className="btn" disabled={s.busy}>{s.busy ? 'Saving…' : 'Save changes'}</button>
                  <button type="button" className="btn ghost" onClick={() => navigate('/my-class')}>Back</button>
                </div>
              </form>
            </Card>
          </>
        )}
      </Status>
    </>
  );
}
