import { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFile, download, saveCsv } from '../api.js';
import { Card } from '../components/ui.jsx';
import { Feedback, useSaver } from '../components/forms.jsx';

export default function ImportStudents() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [onlyProblems, setOnlyProblems] = useState(false);
  const s = useSaver();

  const pick = (e) => { setFile(e.target.files[0] ?? null); setPreview(null); setResult(null); s.setError(''); };
  const check = () => s.run(async () => { setResult(null); setPreview(await apiFile('/import/students/preview', file)); });
  const commit = () => {
    if (!window.confirm(`Create ${preview.valid} student account(s)? Rows with problems will be skipped.`)) return;
    s.run(async () => { setResult(await apiFile('/import/students/commit', file)); setPreview(null); });
  };
  const saveLogins = () => saveCsv('student-logins.csv', [
    ['Name', 'Enrollment No', 'Class', 'Login email', 'Temporary password'],
    ...result.created.map((c) => [c.name, c.enrollmentNo, c.class, c.email, c.tempPassword]),
  ]);

  const rows = preview ? preview.rows.filter((r) => !onlyProblems || !r.ok) : [];
  return (
    <>
      <h1>Import students</h1>
      <Card title="1. Download the Excel template" note="Course, Department, Year, Semester, Section, Name, Enrollment No, Contact No and more">
        <p className="muted">Fill one row per student. Leave Department empty for courses that have none (BBA, BCA, MBA). The second sheet lists the valid courses and departments.</p>
        <button className="btn ghost" onClick={() => s.run(() => download('/import/students/template', 'vsgoi-students-template.xlsx'))}>Download template (.xlsx)</button>
      </Card>

      <Card title="2. Upload your file">
        <div className="toolbar">
          <input type="file" accept=".xlsx" onChange={pick} aria-label="Excel file" />
          <button className="btn" onClick={check} disabled={!file || s.busy}>{s.busy && !preview ? 'Checking…' : 'Check file'}</button>
        </div>
        <Feedback error={s.error} />
      </Card>

      {preview && (
        <Card title="3. Check and import" note={`${preview.total} rows: ${preview.valid} ready, ${preview.invalid} with problems`}>
          <div className="toolbar">
            <button className="btn" onClick={commit} disabled={s.busy || preview.valid === 0}>{s.busy ? 'Importing…' : `Import ${preview.valid} valid students`}</button>
            <label className="inline-check"><input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} /> Show only rows with problems</label>
          </div>
          <div className="table-wrap scroll-y tall">
            <table className="tbl">
              <thead><tr><th>Row</th><th>Result</th><th>Name</th><th>Enrollment No</th><th>Class</th><th>Login email</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.row} className={r.ok ? '' : 'row-bad'}>
                    <td>{r.row}</td>
                    <td>{r.ok ? <span className="badge s-active">Ready</span> : <ul className="errs">{r.errors.map((e) => <li key={e}>{e}</li>)}</ul>}</td>
                    <td>{r.name}</td><td>{r.enrollmentNo}</td>
                    <td>{r.course}{r.department ? ` ${r.department}` : ''} · Sem {r.semester} · {r.section}</td>
                    <td>{r.email || '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {result && (
        <Card title="Import finished" note={`${result.created.length} created, ${result.skipped.length} skipped`}>
          {result.created.length > 0 && (
            <>
              <p className="success" role="status">Download the login details now. The temporary passwords are shown only once, and each student must change theirs at first sign-in.</p>
              <div className="toolbar">
                <button className="btn" onClick={saveLogins}>Download login details (CSV)</button>
                <Link className="btn ghost" to="/students">View students</Link>
              </div>
            </>
          )}
          {result.skipped.length > 0 && (
            <>
              <h3 className="subhead">Skipped rows</h3>
              <div className="table-wrap scroll-y">
                <table className="tbl">
                  <thead><tr><th>Row</th><th>Name</th><th>Enrollment No</th><th>Why</th></tr></thead>
                  <tbody>{result.skipped.map((r) => <tr key={r.row}><td>{r.row}</td><td>{r.name}</td><td>{r.enrollmentNo}</td><td>{r.errors.join(' ')}</td></tr>)}</tbody>
                </table>
              </div>
            </>
          )}
        </Card>
      )}
    </>
  );
}
