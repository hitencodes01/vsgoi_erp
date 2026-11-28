import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useFetch } from '../useFetch.js';
import { Card, Status } from './ui.jsx';
import ClassPicker from './ClassPicker.jsx';
import { Feedback, useSaver } from './forms.jsx';

// One config-driven add/edit screen used for courses, departments, subjects and notices.
//   fields: [{ key, label, type: text|number|textarea|date|select|class, options(form, meta), hint, wide, show(form, meta), disabledWhenEditing }]
export default function EntityForm({ noun, base, listPath, backLabel, fields, blank, toBody, fromItem, deletable = true }) {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const meta = useFetch('/meta');
  const existing = useFetch(editing ? `${base}/${id}` : null);
  const [form, setForm] = useState(blank);
  const s = useSaver();

  useEffect(() => {
    if (existing.data) setForm({ ...blank, ...(fromItem ? fromItem(existing.data.item) : existing.data.item) });
  }, [existing.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = (e) => {
    e.preventDefault();
    s.run(async () => {
      const body = toBody ? toBody(form) : form;
      if (editing) {
        await api(`${base}/${id}`, { method: 'PUT', body });
        s.setOk('Changes saved.');
      } else {
        await api(base, { method: 'POST', body });
        navigate(listPath);
      }
    });
  };
  const remove = () => {
    if (!window.confirm(`Delete this ${noun}?`)) return;
    s.run(async () => {
      try {
        await api(`${base}/${id}`, { method: 'DELETE' });
      } catch (e) {
        // The server says "HAS_DATA" when real records (lectures, attendance, exams) hang off this item.
        if (e.code !== 'HAS_DATA' || !window.confirm(`${e.message}\n\nDelete it anyway? All of those records are erased permanently.`)) throw e;
        await api(`${base}/${id}?force=1`, { method: 'DELETE' });
      }
      navigate(listPath);
    });
  };

  const m = meta.data;
  return (
    <>
      <p><Link to={listPath}>← Back to {backLabel}</Link></p>
      <h1>{editing ? `Edit ${noun}` : `Add ${noun}`}</h1>
      <Status loading={meta.loading || existing.loading} error={meta.error || existing.error}>
        {m && (
          <Card>
            <form onSubmit={submit} noValidate>
              <div className="form-grid">
                {fields.filter((f) => !f.show || f.show(form, m)).map((f) => {
                  if (f.type === 'class') {
                    return <ClassPicker key="class" meta={m} value={form} onChange={(v) => setForm({ ...form, ...v })} />;
                  }
                  const fid = `f-${f.key}`;
                  const disabled = editing && f.disabledWhenEditing;
                  return (
                    <div key={f.key} className={`field ${f.wide ? 'wide' : ''}`}>
                      <label htmlFor={fid}>{f.label}</label>
                      {f.type === 'select' ? (
                        <select id={fid} value={form[f.key] ?? ''} onChange={set(f.key)} disabled={disabled}>
                          <option value="">{f.empty ?? 'Choose…'}</option>
                          {f.options(form, m).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      ) : f.type === 'textarea' ? (
                        <textarea id={fid} rows={f.rows ?? 5} value={form[f.key] ?? ''} onChange={set(f.key)} />
                      ) : (
                        <input id={fid} type={f.type ?? 'text'} value={form[f.key] ?? ''} disabled={disabled} min={f.min} max={f.max}
                          onChange={f.upper ? (e) => setForm({ ...form, [f.key]: e.target.value.toUpperCase() }) : set(f.key)} />
                      )}
                      {f.hint && <div className="hint">{f.hint}</div>}
                    </div>
                  );
                })}
              </div>
              <Feedback error={s.error} ok={s.ok} />
              <div className="toolbar">
                <button className="btn" disabled={s.busy}>{s.busy ? 'Saving…' : editing ? 'Save changes' : `Add ${noun}`}</button>
                <Link className="btn ghost" to={listPath}>Cancel</Link>
                {editing && deletable && <button type="button" className="btn danger" onClick={remove} disabled={s.busy}>Delete</button>}
              </div>
            </form>
          </Card>
        )}
      </Status>
    </>
  );
}
