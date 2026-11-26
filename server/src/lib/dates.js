// Dates are stored as calendar days (UTC midnight) to match MySQL DATE columns.
export const today = () => {
  const n = new Date();
  return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()));
};
export const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
export const iso = (d) => d.toISOString().slice(0, 10);
export const parseDate = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s || '') ? new Date(`${s}T00:00:00Z`) : null);
