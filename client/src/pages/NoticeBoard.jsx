import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { useFetch } from '../useFetch.js';
import { Card, Status, fmtFull } from '../components/ui.jsx';
import { Feedback, useSaver } from '../components/forms.jsx';

export default function NoticeBoard() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useFetch('/notices');
  const s = useSaver();
  const isAdmin = user.role === 'ADMIN';
  const remove = (id) => {
    if (!window.confirm('Delete this notice?')) return;
    s.run(async () => { await api(`/notices/${id}`, { method: 'DELETE' }); reload(); });
  };
  return (
    <>
      <h1>Notices</h1>
      {isAdmin && <p><Link className="btn" to="/notices/new">Post a notice</Link></p>}
      <Feedback error={s.error} ok={s.ok} />
      <Status loading={loading} error={error}>
        {data?.notices.length === 0 && <p className="state">No notices yet.</p>}
        {data?.notices.map((n) => (
          <Card key={n.id} title={n.title} note={`${fmtFull(n.date)} · ${n.audience}${n.course ? ` · ${n.course}` : ''} · ${n.by}`}>
            <p className="notice-body">{n.body}</p>
            {isAdmin && (
              <div className="toolbar">
                <Link to={`/notices/${n.id}/edit`}>Edit</Link>
                <button type="button" className="link" onClick={() => remove(n.id)}>Delete</button>
              </div>
            )}
          </Card>
        ))}
      </Status>
    </>
  );
}
