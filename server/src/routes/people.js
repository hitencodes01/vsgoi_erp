import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { iso, parseDate, today } from '../lib/dates.js';
import { facultyLocal, lastTwoDigits, studentLocal, uniqueEmail } from '../lib/emails.js';
import { tempPassword } from '../lib/password.js';
import { SECTIONS, resolveClass, yearOf } from '../lib/classes.js';
import { fail, guard, idOf } from '../lib/http.js';

// Students, faculty and admins: only admins can add or change them.
const router = Router();
router.use(requireAuth, requireRole('ADMIN'));

// ---------- validation ----------
const phone = z.string().trim().regex(/^\+?[\d\s-]{7,20}$/, 'Enter a valid phone number.');
const optPhone = z.union([phone, z.literal('')]).optional();
const nameField = z.string().trim().min(2, 'Enter the full name.').max(100, 'The name is too long.');
const emailField = z.string().trim().toLowerCase().email('Enter a valid email address.');
const text = (max, msg) => z.string().trim().max(max, msg).optional();
const details = {
  phone: optPhone,
  city: text(80, 'City is too long.'),
  address: text(255, 'Address is too long.'),
  dateOfBirth: z.string().optional(),
};
const studentFields = {
  enrollmentNo: z.string().trim().min(1, 'Enter the enrollment number.').max(30, 'Enrollment number is too long.'),
  courseId: z.number({ invalid_type_error: 'Choose a course.', required_error: 'Choose a course.' }).int(),
  departmentId: z.number().int().nullable().optional(),
  semester: z.number({ invalid_type_error: 'Choose a semester.', required_error: 'Choose a semester.' }).int(),
  section: z.enum(SECTIONS, { errorMap: () => ({ message: 'Section must be A, B or C.' }) }),
  alternateContact: optPhone,
  personalEmail: z.union([z.string().trim().email('Enter a valid personal email.'), z.literal('')]).optional(),
  fatherName: text(100, "Father's name is too long."),
  motherName: text(100, "Mother's name is too long."),
  lastSchool: text(150, 'Last school name is too long.'),
};
// The personal details a class coordinator may also change for the students of their class (see routes/coordinator.js).
export const contactFields = {
  phone: optPhone,
  city: details.city,
  address: details.address,
  alternateContact: studentFields.alternateContact,
  personalEmail: studentFields.personalEmail,
  fatherName: studentFields.fatherName,
  motherName: studentFields.motherName,
  lastSchool: studentFields.lastSchool,
};
const aadhaar2 = z.union([z.string().regex(/^\d{2}$/, 'Enter the last 2 digits of Aadhaar, or leave it empty.'), z.literal('')]).optional();
const employeeCode = z.string().trim().min(1, 'Enter the employee code.').max(30, 'Employee code is too long.');

const createStudent = z.object({ name: nameField, aadhaarLast2: aadhaar2, ...studentFields, ...details });
const editStudent = z.object({ name: nameField, email: emailField, status: z.enum(['ACTIVE', 'PASSED_OUT']).optional(), ...studentFields, ...details });
const createFaculty = z.object({ name: nameField, employeeCode, ...details });
const editFaculty = z.object({ name: nameField, email: emailField, employeeCode, ...details });
const createAdmin = z.object({ name: nameField, ...details });
const editAdmin = z.object({ name: nameField, email: emailField, ...details });

function detailData(d) {
  const out = {};
  for (const k of ['phone', 'city', 'address']) if (d[k] !== undefined) out[k] = d[k] === '' ? null : d[k];
  if (d.dateOfBirth !== undefined) {
    if (d.dateOfBirth === '') out.dateOfBirth = null;
    else {
      const dob = parseDate(d.dateOfBirth);
      if (!dob || dob > today() || dob.getUTCFullYear() < 1900) return { error: 'Enter a valid date of birth.' };
      out.dateOfBirth = dob;
    }
  }
  return { data: out };
}

function parseBody(schema, req, res) {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return void fail(res, parsed.error.issues[0].message);
  const det = detailData(parsed.data);
  if (det.error) return void fail(res, det.error);
  return { ...parsed.data, details: det.data };
}

const blank = (v) => (v === undefined || v === '' ? null : v);
const studentCols = (b, cls) => ({
  enrollmentNo: b.enrollmentNo, courseId: cls.course.id, departmentId: cls.department?.id ?? null, semester: b.semester, section: b.section,
  alternateContact: blank(b.alternateContact), personalEmail: blank(b.personalEmail), fatherName: blank(b.fatherName), motherName: blank(b.motherName), lastSchool: blank(b.lastSchool),
});
const detailsOut = (u) => ({ phone: u.phone ?? '', city: u.city ?? '', address: u.address ?? '', dateOfBirth: u.dateOfBirth ? iso(u.dateOfBirth) : '' });
const statusOf = (u, extra) => (!u.active ? 'Inactive' : extra === 'PASSED_OUT' ? 'Passed out' : 'Active');

async function newCredentials(local) {
  const email = await uniqueEmail(prisma, local);
  const temp = tempPassword();
  return { email, temp, passwordHash: await bcrypt.hash(temp, 10) };
}
const otherActiveAdmins = (exceptUserId) => prisma.user.count({ where: { role: 'ADMIN', active: true, id: { not: exceptUserId } } });

// Shows the generated login email before the account is saved.
router.post('/preview-email', guard(async (req, res) => {
  const p = z.object({
    kind: z.enum(['students', 'faculty', 'admins']), name: nameField,
    courseId: z.number().int().optional(), enrollmentNo: z.string().optional(), aadhaarLast2: z.string().optional(),
  }).safeParse(req.body);
  if (!p.success) return res.json({ email: null });
  const { kind, name, courseId, enrollmentNo, aadhaarLast2 } = p.data;
  let local = '';
  if (kind === 'faculty') local = facultyLocal(name);
  else if (kind === 'admins') local = 'admin';
  else if (courseId) {
    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (course) local = studentLocal(name, course.code, lastTwoDigits(aadhaarLast2, enrollmentNo));
  }
  res.json({ email: local ? await uniqueEmail(prisma, local) : null });
}));

// ---------- students ----------
router.get('/students', guard(async (_req, res) => {
  const list = await prisma.student.findMany({
    include: { user: true, course: true, department: true },
    orderBy: [{ courseId: 'asc' }, { departmentId: 'asc' }, { semester: 'asc' }, { section: 'asc' }, { enrollmentNo: 'asc' }],
    take: 5000,
  });
  res.json({
    rows: list.map((s) => ({
      id: s.id, enrollmentNo: s.enrollmentNo, name: s.user.name, course: s.course.code, department: s.department?.code ?? '',
      semester: s.semester, year: yearOf(s.semester), section: s.section, contact: s.user.phone ?? '', status: statusOf(s.user, s.status),
    })),
  });
}));

router.post('/students', guard(async (req, res) => {
  const b = parseBody(createStudent, req, res);
  if (!b) return;
  const cls = await resolveClass(b);
  if (cls.error) return fail(res, cls.error);
  const digits = lastTwoDigits(b.aadhaarLast2, b.enrollmentNo);
  if (!digits) return fail(res, 'The enrollment number needs at least 2 digits (or enter the last 2 digits of Aadhaar).');
  const local = studentLocal(b.name, cls.course.code, digits);
  if (!local) return fail(res, 'Enter a name that contains letters.');
  const { email, temp, passwordHash } = await newCredentials(local);
  const user = await prisma.user.create({
    data: { email, name: b.name, role: 'STUDENT', passwordHash, mustChangePassword: true, ...b.details, student: { create: studentCols(b, cls) } },
    include: { student: true },
  });
  res.status(201).json({ id: user.student.id, email, tempPassword: temp });
}));

router.get('/students/:id', guard(async (req, res) => {
  const id = idOf(req);
  const s = id && (await prisma.student.findUnique({ where: { id }, include: { user: true } }));
  if (!s) return fail(res, 'Student not found.', 404);
  res.json({
    item: {
      id: s.id, userId: s.userId, name: s.user.name, email: s.user.email, active: s.user.active, status: s.status,
      enrollmentNo: s.enrollmentNo, courseId: s.courseId, departmentId: s.departmentId ?? '', semester: s.semester, section: s.section,
      alternateContact: s.alternateContact ?? '', personalEmail: s.personalEmail ?? '', fatherName: s.fatherName ?? '', motherName: s.motherName ?? '', lastSchool: s.lastSchool ?? '',
      ...detailsOut(s.user),
    },
  });
}));

router.put('/students/:id', guard(async (req, res) => {
  const id = idOf(req);
  const b = parseBody(editStudent, req, res);
  if (!b) return;
  const s = id && (await prisma.student.findUnique({ where: { id } }));
  if (!s) return fail(res, 'Student not found.', 404);
  const cls = await resolveClass(b);
  if (cls.error) return fail(res, cls.error);
  await prisma.$transaction([
    prisma.user.update({ where: { id: s.userId }, data: { name: b.name, email: b.email, ...b.details } }),
    prisma.student.update({ where: { id }, data: { ...studentCols(b, cls), ...(b.status ? { status: b.status } : {}) } }),
  ]);
  res.json({ saved: true });
}));

// ---------- faculty ----------
router.get('/faculty', guard(async (_req, res) => {
  const list = await prisma.teacher.findMany({ include: { user: true, _count: { select: { assignments: true } } }, orderBy: { employeeCode: 'asc' } });
  res.json({
    rows: list.map((t) => ({ id: t.id, employeeCode: t.employeeCode, name: t.user.name, email: t.user.email, contact: t.user.phone ?? '', assignments: t._count.assignments, status: statusOf(t.user) })),
  });
}));

router.post('/faculty', guard(async (req, res) => {
  const b = parseBody(createFaculty, req, res);
  if (!b) return;
  const local = facultyLocal(b.name);
  if (!local) return fail(res, 'Enter a name that contains letters.');
  const { email, temp, passwordHash } = await newCredentials(local);
  const user = await prisma.user.create({
    data: { email, name: b.name, role: 'TEACHER', passwordHash, mustChangePassword: true, ...b.details, teacher: { create: { employeeCode: b.employeeCode } } },
    include: { teacher: true },
  });
  res.status(201).json({ id: user.teacher.id, email, tempPassword: temp });
}));

router.get('/faculty/:id', guard(async (req, res) => {
  const id = idOf(req);
  const t = id && (await prisma.teacher.findUnique({ where: { id }, include: { user: true } }));
  if (!t) return fail(res, 'Faculty member not found.', 404);
  res.json({ item: { id: t.id, userId: t.userId, name: t.user.name, email: t.user.email, active: t.user.active, employeeCode: t.employeeCode, ...detailsOut(t.user) } });
}));

router.put('/faculty/:id', guard(async (req, res) => {
  const id = idOf(req);
  const b = parseBody(editFaculty, req, res);
  if (!b) return;
  const t = id && (await prisma.teacher.findUnique({ where: { id } }));
  if (!t) return fail(res, 'Faculty member not found.', 404);
  await prisma.$transaction([
    prisma.user.update({ where: { id: t.userId }, data: { name: b.name, email: b.email, ...b.details } }),
    prisma.teacher.update({ where: { id }, data: { employeeCode: b.employeeCode } }),
  ]);
  res.json({ saved: true });
}));

// ---------- admins (ids here are user ids) ----------
router.get('/admins', guard(async (_req, res) => {
  const list = await prisma.user.findMany({ where: { role: 'ADMIN' }, orderBy: { id: 'asc' } });
  res.json({ rows: list.map((u) => ({ id: u.id, name: u.name, email: u.email, contact: u.phone ?? '', status: statusOf(u) })) });
}));

router.post('/admins', guard(async (req, res) => {
  const b = parseBody(createAdmin, req, res);
  if (!b) return;
  const { email, temp, passwordHash } = await newCredentials('admin');
  const user = await prisma.user.create({ data: { email, name: b.name, role: 'ADMIN', passwordHash, mustChangePassword: true, ...b.details } });
  res.status(201).json({ id: user.id, email, tempPassword: temp });
}));

router.get('/admins/:id', guard(async (req, res) => {
  const id = idOf(req);
  const u = id && (await prisma.user.findFirst({ where: { id, role: 'ADMIN' } }));
  if (!u) return fail(res, 'Admin not found.', 404);
  res.json({ item: { id: u.id, userId: u.id, name: u.name, email: u.email, active: u.active, ...detailsOut(u) } });
}));

router.put('/admins/:id', guard(async (req, res) => {
  const id = idOf(req);
  const b = parseBody(editAdmin, req, res);
  if (!b) return;
  const u = id && (await prisma.user.findFirst({ where: { id, role: 'ADMIN' } }));
  if (!u) return fail(res, 'Admin not found.', 404);
  await prisma.user.update({ where: { id }, data: { name: b.name, email: b.email, ...b.details } });
  res.json({ saved: true });
}));

// ---------- any account (ids here are user ids) ----------
router.patch('/users/:id/active', guard(async (req, res) => {
  const id = idOf(req);
  const p = z.object({ active: z.boolean() }).safeParse(req.body);
  if (!id || !p.success) return fail(res, 'Invalid request.');
  if (id === req.user.id) return fail(res, 'You cannot deactivate your own account.');
  const u = await prisma.user.findUnique({ where: { id } });
  if (!u) return fail(res, 'User not found.', 404);
  if (!p.data.active && u.role === 'ADMIN' && (await otherActiveAdmins(u.id)) === 0) return fail(res, 'There must be at least one active admin.');
  await prisma.user.update({ where: { id }, data: { active: p.data.active, ...(p.data.active ? {} : { tokenVersion: { increment: 1 } }) } });
  res.json({ active: p.data.active });
}));

router.post('/users/:id/reset-password', guard(async (req, res) => {
  const id = idOf(req);
  if (!id) return fail(res, 'Invalid user.');
  if (id === req.user.id) return fail(res, 'Use Settings to change your own password.');
  const u = await prisma.user.findUnique({ where: { id } });
  if (!u) return fail(res, 'User not found.', 404);
  const temp = tempPassword();
  await prisma.$transaction([
    prisma.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(temp, 10), mustChangePassword: true, tokenVersion: { increment: 1 } } }),
    prisma.passwordReset.updateMany({ where: { userId: id, usedAt: null }, data: { usedAt: new Date() } }),
  ]);
  res.json({ tempPassword: temp });
}));

export default router;
