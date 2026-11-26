import { useFetch } from '../useFetch.js';
import { Card, Status, pct } from '../components/ui.jsx';

export default function Results() {
  const { data, loading, error } = useFetch('/exams/results/mine');
  return (
    <>
      <h1>Results</h1>
      <Status loading={loading} error={error}>
        {data && (
          <>
            {data.semesters.length === 0 && <p className="state">No marks have been entered for you yet.</p>}
            {data.semesters.map((sem) => (
              <Card key={sem.semester} title={`Semester ${sem.semester}`} note={`${sem.obtained} / ${sem.max} · ${pct(sem.percent)} · ${sem.pass ? 'Pass' : 'Below pass marks'} (pass = ${data.passPercent}%)`}>
                <div className="table-wrap">
                  <table className="tbl">
                    <thead><tr><th>Subject</th><th>Exams</th><th>Total</th><th>%</th><th>Result</th></tr></thead>
                    <tbody>
                      {sem.subjects.map((s) => (
                        <tr key={s.code}>
                          <td><strong>{s.code}</strong> {s.name}</td>
                          <td>{s.exams.map((e) => `${e.name}: ${e.score}/${e.max}`).join(', ')}</td>
                          <td>{s.obtained} / {s.max}</td>
                          <td>{pct(s.percent)}</td>
                          <td><span className={`badge ${s.pass ? 's-paid' : 's-overdue'}`}>{s.pass ? 'Pass' : 'Fail'}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            ))}
          </>
        )}
      </Status>
    </>
  );
}
