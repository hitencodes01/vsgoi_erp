import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { useFetch } from '../useFetch.js';
import { Card, Kpi, Status, fmtMoney } from '../components/ui.jsx';

const money = fmtMoney;
const A = ['ADMIN'];

// Every list screen is described here: where the rows come from, which columns, which filters, where Add/Edit go.
const KINDS = {
  students: {
    title: 'Students', path: '/people/students', roles: A, add: '/students/new', edit: (r) => `/students/${r.id}/edit`,
    cols: [['enrollmentNo', 'Enrollment No'], ['name', 'Name'], ['course', 'Course'], ['department', 'Department'], ['semester', 'Sem'], ['year', 'Year'], ['section', 'Sec'], ['contact', 'Contact'], ['status', 'Status']],
    filters: [['course', 'Course'], ['department', 'Department'], ['semester', 'Semester'], ['section', 'Section'], ['status', 'Status']],
  },
  faculty: {
    title: 'Faculty', path: '/people/faculty', roles: A, add: '/faculty/new', edit: (r) => `/faculty/${r.id}/edit`,
    cols: [['employeeCode', 'Code'], ['name', 'Name'], ['email', 'Login email'], ['contact', 'Contact'], ['assignments', 'Subjects'], ['status', 'Status']],
    filters: [['status', 'Status']],
  },
  admins: {
    title: 'Admins', path: '/people/admins', roles: A, add: '/admins/new', edit: (r) => `/admins/${r.id}/edit`,
    cols: [['name', 'Name'], ['email', 'Login email'], ['contact', 'Contact'], ['status', 'Status']],
  },
  courses: {
    title: 'Courses', path: '/structure/courses', roles: A, add: '/courses/new', edit: (r) => `/courses/${r.id}/edit`,
    cols: [['code', 'Code'], ['name', 'Name'], ['semesters', 'Semesters'], ['years', 'Years'], ['departments', 'Departments'], ['students', 'Students'], ['subjects', 'Subjects']],
  },
  departments: {
    title: 'Departments', path: '/structure/departments', roles: A, add: '/departments/new', edit: (r) => `/departments/${r.id}/edit`,
    cols: [['course', 'Course'], ['code', 'Code'], ['name', 'Name'], ['semesters', 'Semesters'], ['students', 'Students'], ['subjects', 'Subjects']],
    filters: [['course', 'Course']],
  },
  subjects: {
    title: 'Subjects', path: '/structure/subjects', roles: A, add: '/subjects/new', edit: (r) => `/subjects/${r.id}/edit`,
    cols: [['code', 'Code'], ['name', 'Name'], ['course', 'Course'], ['department', 'Department'], ['semester', 'Sem'], ['credits', 'Credits']],
    filters: [['course', 'Course'], ['department', 'Department'], ['semester', 'Semester']],
  },
  fees: {
    title: 'Fees', path: '/fees', roles: A, add: '/fees/new', addLabel: 'New fee', edit: (r) => `/fees/${r.id}`, editLabel: 'Open',
    cols: [['enrollmentNo', 'Enrollment No'], ['name', 'Name'], ['course', 'Course'], ['title', 'Fee'], ['amount', 'Amount', money], ['paid', 'Paid', money], ['balance', 'Balance', money], ['dueDate', 'Due'], ['status', 'Status']],
    filters: [['course', 'Course'], ['status', 'Status'], ['title', 'Fee']],
  },
  exams: {
    title: 'Exams', path: '/exams', roles: ['ADMIN', 'TEACHER'], add: '/exams/new', addLabel: 'New exam', edit: (r) => `/exams/${r.id}`, editLabel: 'Marks',
    cols: [['name', 'Exam'], ['subject', 'Subject'], ['class', 'Class'], ['session', 'Session'], ['maxMarks', 'Max'], ['date', 'Date'], ['marksEntered', 'Marks entered']],
    filters: [['session', 'Session']],
  },
};

const pillClass = (v) => `badge s-${String(v).toLowerCase().replace(/\s+/g, '-')}`;

export default function ListPage({ kind }) {
  const cfg = KINDS[kind];
  const { user } = useAuth();
  const canEdit = cfg.roles.includes(user.role);
  const { data, loading, error } = useFetch(cfg.path);
  const [q, setQ] = useState('');
  const [f, setF] = useState({});

  const all = data?.rows ?? [];
  const rows = all.filter(
    (r) => Object.values(r).join(' ').toLowerCase().includes(q.toLowerCase()) && Object.entries(f).every(([k, v]) => !v || String(r[k]) === v)
  );
  const options = (key) => [...new Set(all.map((r) => r[key]).filter((v) => v !== '' && v !== null && v !== undefined))].map(String).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  return (
    <>
      <h1>{cfg.title}</h1>
      {data?.totals && (
        <div className="kpis">
          <Kpi label="Total demanded" value={money(data.totals.amount)} />
          <Kpi label="Collected" value={money(data.totals.paid)} tone="good" />
          <Kpi label="Pending" value={money(data.totals.amount - data.totals.paid)} tone={data.totals.amount > data.totals.paid ? 'warn' : 'good'} />
        </div>
      )}
      <Card title={`${rows.length} of ${all.length}`}>
        <div className="filters">
          <label>Search<input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${cfg.title.toLowerCase()}`} /></label>
          {(cfg.filters ?? []).map(([key, label]) => (
            <label key={key}>{label}
              <select value={f[key] ?? ''} onChange={(e) => setF({ ...f, [key]: e.target.value })}>
                <option value="">All</option>
                {options(key).map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
          ))}
          {canEdit && cfg.add && <Link className="btn grow" to={cfg.add}>{cfg.addLabel ?? 'Add'}</Link>}
        </div>
        <Status loading={loading} error={error}>
          {rows.length === 0 ? (
            <p className="state">Nothing to show.</p>
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr>{cfg.cols.map(([, label]) => <th key={label}>{label}</th>)}{canEdit && <th />}</tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className={r.status === 'Inactive' ? 'inactive' : ''}>
                      {cfg.cols.map(([k, , fmt]) => (
                        <td key={k}>
                          {k === 'status' ? <span className={pillClass(r[k])}>{r[k]}</span> : r[k] === '' || r[k] === null ? '–' : fmt ? fmt(r[k]) : r[k]}
                        </td>
                      ))}
                      {canEdit && <td><Link to={cfg.edit(r)}>{cfg.editLabel ?? 'Edit'}</Link></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Status>
      </Card>
    </>
  );
}
