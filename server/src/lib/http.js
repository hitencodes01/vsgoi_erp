export const fail = (res, message, status = 400) => res.status(status).json({ error: message });

export const idOf = (req, name = 'id') => {
  const n = Number(req.params[name]);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const DUPLICATES = [
  ['enrollmentNo', 'That enrollment number is already in use.'],
  ['employeeCode', 'That employee code is already in use.'],
  ['email', 'That email is already in use.'],
  ['code', 'That code is already in use.'],
  ['name', 'That name is already in use.'],
];

// Wraps a route so database "already exists" errors become friendly 409 messages.
export const guard = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (err) {
    if (err?.code === 'P2002') {
      const target = String(err.meta?.target ?? '');
      const hit = DUPLICATES.find(([k]) => target.includes(k));
      return fail(res, hit ? hit[1] : 'One of those values is already in use.', 409);
    }
    next(err);
  }
};
