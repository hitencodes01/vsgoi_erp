import { Router } from 'express';
import express from 'express';
import bcrypt from 'bcryptjs';
import ExcelJS from 'exceljs';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { DOMAIN, lastTwoDigits, studentLocal, uniqueEmail } from '../lib/emails.js';
import { SECTIONS, classLabel } from '../lib/classes.js';
import { tempPassword } from '../lib/password.js';
import { fail, guard } from '../lib/http.js';

// Bulk student upload from the ready-made Excel (Course, Department, Year, Semester, Section, Name, ...).
const router = Router();
router.use(requireAuth, requireRole('ADMIN'));

const MAX_ROWS = 1000;
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

const COLUMNS = [
  ['course', 'Course', ['course']],
  ['department', 'Department', ['department', 'branch', 'trade']],
  ['year', 'Year', ['year']],
  ['semester', 'Semester', ['semester', 'sem']],
  ['section', 'Section', ['section', 'sec']],
  ['name', 'Name', ['name', 'studentname', 'fullname']],
  ['enrollmentNo', 'Enrollment No', ['enrollmentno', 'enrolmentno', 'enrollment', 'enrollmentnumber', 'rollno']],
  ['contact', 'Contact No', ['contactno', 'contact', 'phone', 'mobile', 'mobileno']],
  ['alternateContact', 'Alternate Contact', ['alternatecontact', 'alternatecontactno', 'altcontact']],
  ['personalEmail', 'Email', ['email', 'emailid', 'personalemail']],
  ['address', 'Address', ['address']],
  ['fatherName', 'Father Name', ['fathername', 'father']],
  ['motherName', 'Mother Name', ['mothername', 'mother']],
  ['lastSchool', 'Last School Name', ['lastschoolname', 'lastschool', 'previousschool']],
  ['city', 'City', ['city']],
  ['aadhaar2', 'Aadhaar Last 2 (optional)', ['aadhaarlast2', 'aadhaarlast2optional', 'aadharlast2']],
];
const NONE = new Set(['', '-', 'na', 'n/a', 'none', 'nil']);
const PHONE = /^\+?[\d\s-]{7,20}$/;

function cellText(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('result' in v) return cellText(v.result);
    if ('text' in v) return cellText(v.text);
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('').trim();
    return '';
  }
  return String(v).trim();
}

async function readSheet(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.getWorksheet('Students') ?? wb.worksheets[0];
  if (!ws) throw new Error('The file has no sheet.');
  const index = {};
  ws.getRow(1).eachCell((cell, col) => {
    const n = norm(cellText(cell.value));
    for (const [key, , names] of COLUMNS) if (names.includes(n) && !(key in index)) index[key] = col;
  });
  const missing = ['course', 'name', 'enrollmentNo', 'section'].filter((k) => !(k in index));
  if (!('year' in index) && !('semester' in index)) missing.push('year');
  if (missing.length) throw new Error(`Missing column(s): ${missing.map((k) => COLUMNS.find((c) => c[0] === k)[1]).join(', ')}. Use the downloaded template.`);

  const rows = [];
  ws.eachRow({ includeEmpty: false }, (row, num) => {
    if (num === 1) return;
    const raw = Object.fromEntries(COLUMNS.map(([key]) => [key, key in index ? cellText(row.getCell(index[key]).value) : '']));
    if (Object.values(raw).some((v) => v !== '')) rows.push({ row: num, raw });
  });
  if (!rows.length) throw new Error('No student rows found below the header.');
  if (rows.length > MAX_ROWS) throw new Error(`The file has ${rows.length} rows. Upload at most ${MAX_ROWS} at a time.`);
  return rows;
}

async function validate(rows) {
  const courses = await prisma.course.findMany({ include: { departments: true }, orderBy: { code: 'asc' } });
  const byCourse = new Map();
  for (const c of courses) {
    byCourse.set(norm(c.code), c);
    byCourse.set(norm(c.name), c);
  }
  const nos = rows.map((r) => r.raw.enrollmentNo).filter(Boolean);
  const taken = new Set((await prisma.student.findMany({ where: { enrollmentNo: { in: nos } }, select: { enrollmentNo: true } })).map((s) => s.enrollmentNo.toLowerCase()));
  const seen = new Set();

  return rows.map(({ row, raw }) => {
    const errors = [];
    const course = byCourse.get(norm(raw.course));
    if (!raw.course) errors.push('Course is required.');
    else if (!course) errors.push(`Course "${raw.course}" not found (use ${courses.map((c) => c.code).join(', ')}).`);

    let department = null;
    if (course) {
      const dep = NONE.has(raw.department.toLowerCase()) ? '' : raw.department;
      const names = course.departments.map((d) => d.code).join(', ');
      if (course.departments.length) {
        if (!dep) errors.push(`Department is required for ${course.code} (${names}).`);
        else {
          department = course.departments.find((d) => norm(d.code) === norm(dep) || norm(d.name) === norm(dep)) ?? null;
          if (!department) errors.push(`Department "${dep}" not found in ${course.code} (use ${names}).`);
        }
      } else if (dep) errors.push(`${course.code} has no departments, so leave Department empty.`);
    }

    const year = raw.year ? Number(raw.year) : null;
    let semester = raw.semester ? Number(raw.semester) : null;
    if (year !== null && !Number.isInteger(year)) errors.push('Year must be a whole number.');
    if (semester !== null && !Number.isInteger(semester)) errors.push('Semester must be a whole number.');
    if (semester === null && Number.isInteger(year)) semester = year * 2 - 1; // no semester given: first semester of that year
    if (semester === null) errors.push('Year or Semester is required.');
    else if (Number.isInteger(year) && Number.isInteger(semester) && Math.ceil(semester / 2) !== year) errors.push(`Semester ${semester} is not in year ${year}.`);
    if (course && Number.isInteger(semester)) {
      const max = department?.semesters ?? course.semesters;
      if (semester < 1 || semester > max) errors.push(`Semester must be 1 to ${max} for ${department?.code ?? course.code}.`);
    }

    const section = raw.section.toUpperCase();
    if (!SECTIONS.includes(section)) errors.push('Section must be A, B or C.');
    if (raw.name.length < 2 || raw.name.length > 100) errors.push('Name is required (2 to 100 characters).');

    const key = raw.enrollmentNo.toLowerCase();
    if (!raw.enrollmentNo) errors.push('Enrollment No is required.');
    else if (raw.enrollmentNo.length > 30) errors.push('Enrollment No is too long.');
    else if (seen.has(key)) errors.push('Enrollment No is repeated in this file.');
    else if (taken.has(key)) errors.push('Enrollment No is already registered.');
    seen.add(key);

    for (const [k, label] of [['contact', 'Contact No'], ['alternateContact', 'Alternate Contact']]) {
      if (raw[k] && !PHONE.test(raw[k])) errors.push(`${label} is not a valid phone number.`);
    }
    if (raw.personalEmail && !/^\S+@\S+\.\S+$/.test(raw.personalEmail)) errors.push('Email is not valid.');
    if (raw.aadhaar2 && !/^\d{2}$/.test(raw.aadhaar2)) errors.push('Aadhaar Last 2 must be exactly 2 digits.');
    for (const [k, max, label] of [['address', 255, 'Address'], ['city', 80, 'City'], ['fatherName', 100, 'Father Name'], ['motherName', 100, 'Mother Name'], ['lastSchool', 150, 'Last School Name']]) {
      if (raw[k].length > max) errors.push(`${label} is too long.`);
    }

    const digits = lastTwoDigits(raw.aadhaar2, raw.enrollmentNo);
    if (raw.enrollmentNo && !digits) errors.push('Enrollment No needs at least 2 digits for the login email.');
    const local = course && digits ? studentLocal(raw.name, course.code, digits) : '';
    if (course && digits && !local) errors.push('Name must contain letters.');

    return { row, errors, ok: errors.length === 0, raw, course, department, semester, section, local };
  });
}

const preview = (r) => ({
  row: r.row, ok: r.ok, errors: r.errors,
  course: r.course?.code ?? r.raw.course, department: r.department?.code ?? '', semester: r.semester ?? '', section: r.section,
  name: r.raw.name, enrollmentNo: r.raw.enrollmentNo, email: r.local ? `${r.local}@${DOMAIN}` : '',
});

const rawBody = express.raw({ type: () => true, limit: '8mb' });

async function parse(req, res) {
  if (!Buffer.isBuffer(req.body) || !req.body.length) return void fail(res, 'Choose an Excel file first.');
  try {
    return await validate(await readSheet(req.body));
  } catch (err) {
    const known = /Missing column|No student rows|at most|no sheet/.test(err.message);
    return void fail(res, known ? err.message : 'Could not read the file. Upload an .xlsx file made from the template.');
  }
}

router.get('/students/template', guard(async (_req, res) => {
  const courses = await prisma.course.findMany({ include: { departments: true }, orderBy: { code: 'asc' } });
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Students');
  ws.addRow(COLUMNS.map((c) => c[1]));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE8F0' } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  COLUMNS.forEach((_, i) => { ws.getColumn(i + 1).width = i === 10 ? 30 : 18; });
  const codes = courses.map((c) => c.code).join(',');
  for (let r = 2; r <= MAX_ROWS + 1; r++) {
    ws.getCell(`A${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${codes}"`] };
    ws.getCell(`E${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: ['"A,B,C"'] };
  }
  for (const col of ['G', 'H', 'I']) ws.getColumn(col).numFmt = '@'; // keep leading zeros and long numbers as text

  const help = wb.addWorksheet('Valid values');
  help.addRow(['Course', 'Department (leave empty if none)', 'Semesters']).font = { bold: true };
  for (const c of courses) {
    if (!c.departments.length) help.addRow([c.code, '', c.semesters]);
    for (const d of c.departments) help.addRow([c.code, d.code, d.semesters ?? c.semesters]);
  }
  help.addRow([]);
  for (const line of [
    'Section: A, B or C.',
    'Year 1 to 4 and Semester 1 to 8: fill Semester if you can. If it is empty, the first semester of that Year is used.',
    'Enrollment No must be new. The last 2 digits of it are used in the student login email (name + course + 2 digits @vsgoi.org).',
    'Aadhaar Last 2 (optional): if you fill it, those 2 digits are used in the email instead. They are never stored.',
    'Only Course, Year or Semester, Section, Name and Enrollment No are required.',
  ]) help.addRow([line]);
  help.columns = [{ width: 12 }, { width: 34 }, { width: 12 }];

  const buf = await wb.xlsx.writeBuffer();
  res.set({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': 'attachment; filename="vsgoi-students-template.xlsx"',
  });
  res.send(Buffer.from(buf));
}));

// Check the file without saving anything.
router.post('/students/preview', rawBody, guard(async (req, res) => {
  const rows = await parse(req, res);
  if (!rows) return;
  const valid = rows.filter((r) => r.ok).length;
  res.json({ total: rows.length, valid, invalid: rows.length - valid, rows: rows.map(preview) });
}));

// Save the valid rows, skip the rest.
router.post('/students/commit', rawBody, guard(async (req, res) => {
  const rows = await parse(req, res);
  if (!rows) return;
  const created = [];
  const skipped = rows.filter((r) => !r.ok).map((r) => ({ row: r.row, name: r.raw.name, enrollmentNo: r.raw.enrollmentNo, errors: r.errors }));

  for (const r of rows.filter((x) => x.ok)) {
    const email = await uniqueEmail(prisma, r.local);
    const temp = tempPassword();
    try {
      await prisma.user.create({
        data: {
          email, name: r.raw.name, role: 'STUDENT', passwordHash: await bcrypt.hash(temp, 8), mustChangePassword: true,
          phone: r.raw.contact || null, address: r.raw.address || null, city: r.raw.city || null,
          student: {
            create: {
              enrollmentNo: r.raw.enrollmentNo, courseId: r.course.id, departmentId: r.department?.id ?? null, semester: r.semester, section: r.section,
              alternateContact: r.raw.alternateContact || null, personalEmail: r.raw.personalEmail || null,
              fatherName: r.raw.fatherName || null, motherName: r.raw.motherName || null, lastSchool: r.raw.lastSchool || null,
            },
          },
        },
      });
      created.push({ row: r.row, name: r.raw.name, enrollmentNo: r.raw.enrollmentNo, email, tempPassword: temp, class: classLabel({ course: r.course, department: r.department, semester: r.semester, section: r.section }) });
    } catch (err) {
      if (err?.code !== 'P2002') throw err;
      skipped.push({ row: r.row, name: r.raw.name, enrollmentNo: r.raw.enrollmentNo, errors: ['Enrollment No or email already exists.'] });
    }
  }
  res.json({ created, skipped });
}));

export default router;
