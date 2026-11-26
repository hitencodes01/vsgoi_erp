// How login emails are built. Change the rules here and nowhere else.
//   student: name + course code + last 2 digits   -> aaravmishrabtech47@vsgoi.org
//            (last 2 digits of Aadhaar if given, otherwise the last 2 digits of the enrollment number.
//             The Aadhaar digits are used for the email only and are never stored. Branch is never included.)
//   faculty: full name, titles like Dr./Prof. left out -> anitasharma@vsgoi.org
//   admin:   admin                                      -> admin@vsgoi.org
// If an address is taken, a number is added (anitasharma2@vsgoi.org).
export const DOMAIN = 'vsgoi.org';

const TITLES = /^(dr|prof|professor|mr|mrs|ms|miss|shri|smt|er|ca)\.?(\s+|$)/i;

export const slug = (s) =>
  String(s ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const stripTitles = (name) => {
  let n = String(name ?? '').trim();
  while (TITLES.test(n)) n = n.replace(TITLES, '');
  return n;
};

export const facultyLocal = (name) => slug(stripTitles(name));

export const lastTwoDigits = (aadhaarLast2, enrollmentNo) => {
  if (/^\d{2}$/.test(aadhaarLast2 ?? '')) return aadhaarLast2;
  const digits = String(enrollmentNo ?? '').replace(/\D/g, '');
  return digits.length >= 2 ? digits.slice(-2) : '';
};

export const studentLocal = (name, courseCode, digits2) => {
  const n = slug(name);
  const c = slug(courseCode);
  return n && c && /^\d{2}$/.test(digits2 ?? '') ? `${n}${c}${digits2}` : '';
};

export async function uniqueEmail(db, local) {
  let n = 1;
  let email = `${local}@${DOMAIN}`;
  while (await db.user.findUnique({ where: { email }, select: { id: true } })) {
    n += 1;
    email = `${local}${n}@${DOMAIN}`;
  }
  return email;
}
