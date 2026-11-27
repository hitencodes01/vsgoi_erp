const authHeader = () => {
  const token = localStorage.getItem('erp-token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

function expired(res, path) {
  if (res.status === 401 && !path.startsWith('/auth/login')) {
    localStorage.removeItem('erp-token');
    window.location.assign('/login');
  }
}

async function send(path, init) {
  const res = await fetch(`https://vsgoi-erp.onrender.com/api${path}`, init);
  const data = await res.json().catch(() => ({}));
  expired(res, path);
  if (!res.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

export const api = (path, { method = 'GET', body } = {}) =>
  send(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: body ? JSON.stringify(body) : undefined,
  });

// Uploads a file as the raw request body (used for the Excel import).
export const apiFile = (path, file) =>
  send(path, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', ...authHeader() }, body: file });

// Downloads a file the server generates (for example the Excel template).
export async function download(path, filename) {
  const res = await fetch(`'https://vsgoi-erp.onrender.com/api'${path}`, { headers: authHeader() });
  expired(res, path);
  if (!res.ok) throw new Error('Could not download the file.');
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

// Saves rows (for example login details) as a CSV file that opens in Excel.
export function saveCsv(filename, rows) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = `\ufeff${rows.map((r) => r.map(esc).join(',')).join('\r\n')}`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}
