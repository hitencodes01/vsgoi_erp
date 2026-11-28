import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { SECTIONS, maxSemester, resolveClass, studentWhere, yearOf } from '../lib/classes.js';
import { fail, guard, idOf } from '../lib/http.js';
import { currentSession, getSettings } from '../lib/settings.js';

// Courses, departments, subjects, sessions, faculty assignment and promotion: admins only.
const router = Router();
router.use(requireAuth, requireRole('ADMIN'));

const first = (parsed, res) => {
  if (parsed.success) return parsed.data;
  fail(res, parsed.error.issues[0].message);
  return null;
};
const upper = (re, msg) => z.string().trim().toUpperCase().regex(re, msg);
const sem = z.number({ invalid_type_error: 'Semesters must be a number.' }).int().min(1, 'Semesters must be 1 to 12.').max(12, 'Semesters must be 1 to 12.');
const intId = (msg) => z.number({ invalid_type_error: msg, required_error: msg }).int();

// ---------- courses ----------
const courseSchema = z.object({
  code: upper(/^[A-Z0-9]{2,12}$/, 'Code must be 2 to 12 letters or digits, like BTECH.'),
  name: z.string().trim().min(2, 'Enter the course name.').max(100, 'The name is too long.'),
  semesters: sem,
});

router.get('/courses', guard(async (_req, res) => {
  const list = await prisma.course.findMany({ include: { departments: true, _count: { select: { students: true, subjects: true } } }, orderBy: { code: 'asc' } });
  res.json({
    rows: list.map((c) => ({ id: c.id, code: c.code, name: c.name, semesters: c.semesters, years: yearOf(c.semesters), departments: c.departments.map((d) => d.code).join(', ') || 'None', students: c._count.students, subjects: c._count.subjects })),
  });
}));

router.post('/courses', guard(async (req, res) => {
  const b = first(courseSchema.safeParse(req.body), res);
  if (!b) return;
  res.status(201).json({ id: (await prisma.course.create({ data: b })).id });
}));

router.get('/courses/:id', guard(async (req, res) => {
  const id = idOf(req);
  const c = id && (await prisma.course.findUnique({ where: { id } }));
  if (!c) return fail(res, 'Course not found.', 404);
  res.json({ item: { id: c.id, code: c.code, name: c.name, semesters: c.semesters } });
}));

router.put('/courses/:id', guard(async (req, res) => {
  const id = idOf(req);
  const b = first(courseSchema.safeParse(req.body), res);
  if (!b) return;
  const c = id && (await prisma.course.findUnique({ where: { id }, include: { departments: true } }));
  if (!c) return fail(res, 'Course not found.', 404);
  const lowest = await prisma.student.aggregate({ where: { courseId: id }, _max: { semester: true } });
  if (lowest._max.semester > b.semesters) return fail(res, `A student is already in semester ${lowest._max.semester}, so semesters cannot go below that.`, 409);
  await prisma.course.update({ where: { id }, data: b });
  res.json({ saved: true });
}));

router.delete('/courses/:id', guard(async (req, res) => {
  const id = idOf(req);
  const c = id && (await prisma.course.findUnique({ where: { id }, include: { _count: { select: { departments: true, subjects: true, students: true, notices: true } } } }));
  if (!c) return fail(res, 'Course not found.', 404);
  const n = c._count;
  if (n.departments || n.subjects || n.students) return fail(res, `Remove its ${n.departments} departments, ${n.subjects} subjects and ${n.students} students first.`, 409);
  await prisma.notice.updateMany({ where: { courseId: id }, data: { courseId: null } });
  await prisma.course.delete({ where: { id } });
  res.json({ deleted: true });
}));

// ---------- departments (branches / trades) ----------
const deptSchema = z.object({
  courseId: intId('Choose a course.'),
  code: upper(/^[A-Z0-9]{2,15}$/, 'Code must be 2 to 15 letters or digits, like CSE.'),
  name: z.string().trim().min(2, 'Enter the department name.').max(100, 'The name is too long.'),
  semesters: sem.nullable().optional(),
});

router.get('/departments', guard(async (_req, res) => {
  const list = await prisma.department.findMany({ include: { course: true, _count: { select: { students: true, subjects: true } } }, orderBy: [{ courseId: 'asc' }, { code: 'asc' }] });
  res.json({
    rows: list.map((d) => ({ id: d.id, course: d.course.code, code: d.code, name: d.name, semesters: maxSemester(d.course, d), students: d._count.students, subjects: d._count.subjects })),
  });
}));

router.post('/departments', guard(async (req, res) => {
  const b = first(deptSchema.safeParse(req.body), res);
  if (!b) return;
  const course = await prisma.course.findUnique({ where: { id: b.courseId } });
  if (!course) return fail(res, 'Choose a valid course.');
  const [hasStudents, hasSubjects] = await Promise.all([
    prisma.student.count({ where: { courseId: course.id, departmentId: null } }),
    prisma.subject.count({ where: { courseId: course.id, departmentId: null } }),
  ]);
  if (hasStudents || hasSubjects) return fail(res, `${course.code} already has students or subjects without a department. Move them first, then add departments.`, 409);
  res.status(201).json({ id: (await prisma.department.create({ data: { ...b, semesters: b.semesters ?? null } })).id });
}));

router.get('/departments/:id', guard(async (req, res) => {
  const id = idOf(req);
  const d = id && (await prisma.department.findUnique({ where: { id } }));
  if (!d) return fail(res, 'Department not found.', 404);
  res.json({ item: { id: d.id, courseId: d.courseId, code: d.code, name: d.name, semesters: d.semesters ?? '' } });
}));

router.put('/departments/:id', guard(async (req, res) => {
  const id = idOf(req);
  const b = first(deptSchema.safeParse(req.body), res);
  if (!b) return;
  const d = id && (await prisma.department.findUnique({ where: { id }, include: { course: true } }));
  if (!d) return fail(res, 'Department not found.', 404);
  if (b.courseId !== d.courseId) return fail(res, 'A department cannot move to another course.');
  const newMax = b.semesters ?? d.course.semesters;
  const top = await prisma.student.aggregate({ where: { departmentId: id }, _max: { semester: true } });
  if (top._max.semester > newMax) return fail(res, `A student is already in semester ${top._max.semester}.`, 409);
  await prisma.department.update({ where: { id }, data: { code: b.code, name: b.name, semesters: b.semesters ?? null } });
  res.json({ saved: true });
}));

router.delete('/departments/:id', guard(async (req, res) => {
  const id = idOf(req);
  const d = id && (await prisma.department.findUnique({ where: { id }, include: { _count: { select: { students: true, subjects: true } } } }));
  if (!d) return fail(res, 'Department not found.', 404);
  if (d._count.students || d._count.subjects) return fail(res, `Move or remove its ${d._count.students} students and ${d._count.subjects} subjects first.`, 409);
  await prisma.department.delete({ where: { id } });
  res.json({ deleted: true });
}));

// ---------- subjects ----------
const subjectSchema = z.object({
  code: upper(/^[A-Z0-9-]{2,20}$/, 'Code must be 2 to 20 letters, digits or dashes.'),
  name: z.string().trim().min(2, 'Enter the subject name.').max(150, 'The name is too long.'),
  credits: z.number({ invalid_type_error: 'Credits must be a number.' }).int().min(1, 'Credits must be 1 to 10.').max(10, 'Credits must be 1 to 10.'),
  courseId: intId('Choose a course.'),
  departmentId: z.number().int().nullable().optional(),
  semester: intId('Choose a semester.'),
});

router.get('/subjects', guard(async (_req, res) => {
  const list = await prisma.subject.findMany({ include: { course: true, department: true }, orderBy: [{ courseId: 'asc' }, { departmentId: 'asc' }, { semester: 'asc' }, { code: 'asc' }] });
  res.json({ rows: list.map((s) => ({ id: s.id, code: s.code, name: s.name, course: s.course.code, department: s.department?.code ?? '', semester: s.semester, credits: s.credits })) });
}));

router.post('/subjects', guard(async (req, res) => {
  const b = first(subjectSchema.safeParse(req.body), res);
  if (!b) return;
  const cls = await resolveClass(b);
  if (cls.error) return fail(res, cls.error);
  const s = await prisma.subject.create({ data: { code: b.code, name: b.name, credits: b.credits, courseId: b.courseId, departmentId: cls.department?.id ?? null, semester: b.semester } });
  res.status(201).json({ id: s.id });
}));

router.get('/subjects/:id', guard(async (req, res) => {
  const id = idOf(req);
  const s = id && (await prisma.subject.findUnique({ where: { id } }));
  if (!s) return fail(res, 'Subject not found.', 404);
  res.json({ item: { id: s.id, code: s.code, name: s.name, credits: s.credits, courseId: s.courseId, departmentId: s.departmentId ?? '', semester: s.semester } });
}));

router.put('/subjects/:id', guard(async (req, res) => {
  const id = idOf(req);
  const b = first(subjectSchema.safeParse(req.body), res);
  if (!b) return;
  const s = id && (await prisma.subject.findUnique({ where: { id }, include: { _count: { select: { assignments: true } } } }));
  if (!s) return fail(res, 'Subject not found.', 404);
  const cls = await resolveClass(b);
  if (cls.error) return fail(res, cls.error);
  const departmentId = cls.department?.id ?? null;
  const moved = s.courseId !== b.courseId || s.departmentId !== departmentId || s.semester !== b.semester;
  if (moved && s._count.assignments) return fail(res, 'Faculty is already assigned to this subject, so its course, department and semester cannot change.', 409);
  await prisma.subject.update({ where: { id }, data: { code: b.code, name: b.name, credits: b.credits, courseId: b.courseId, departmentId, semester: b.semester } });
  res.json({ saved: true });
}));

// A faculty assignment alone never blocks deleting a subject: it is only a link, so it goes with the subject.
// Real teaching history (lectures, attendance, exams) does block it, unless the admin confirms with ?force=1.
router.delete('/subjects/:id', guard(async (req, res) => {
  const id = idOf(req);
  if (!id || !(await prisma.subject.findUnique({ where: { id }, select: { id: true } }))) return fail(res, 'Subject not found.', 404);
  const of = { assignment: { subjectId: id } };
  const [lectures, attendance, exams] = await Promise.all([prisma.lecture.count({ where: of }), prisma.attendance.count({ where: of }), prisma.exam.count({ where: of })]);
  if ((lectures || attendance || exams) && req.query.force !== '1') {
    return res.status(409).json({ code: 'HAS_DATA', error: `This subject already has ${lectures} lectures, ${attendance} attendance records and ${exams} exams.` });
  }
  // The database removes the lectures, attendance, exams and marks under each assignment (ON DELETE CASCADE).
  await prisma.$transaction([prisma.assignment.deleteMany({ where: { subjectId: id } }), prisma.subject.delete({ where: { id } })]);
  res.json({ deleted: true });
}));

// ---------- sessions and settings ----------
router.get('/sessions', guard(async (_req, res) => {
  const list = await prisma.session.findMany({ include: { _count: { select: { assignments: true } } }, orderBy: { name: 'desc' } });
  res.json({ rows: list.map((s) => ({ id: s.id, name: s.name, current: s.isCurrent, assignments: s._count.assignments })) });
}));

router.post('/sessions', guard(async (req, res) => {
  const p = z.object({ name: z.string().trim().regex(/^\d{4}-\d{2}$/, 'Use a session like 2026-27.') }).safeParse(req.body);
  if (!p.success) return fail(res, p.error.issues[0].message);
  const [a, b] = p.data.name.split('-').map(Number);
  if ((a + 1) % 100 !== b) return fail(res, 'The second year must follow the first, like 2026-27.');
  const isFirst = (await prisma.session.count()) === 0;
  res.status(201).json({ id: (await prisma.session.create({ data: { name: p.data.name, isCurrent: isFirst } })).id });
}));

router.put('/sessions/:id/current', guard(async (req, res) => {
  const id = idOf(req);
  if (!id || !(await prisma.session.findUnique({ where: { id }, select: { id: true } }))) return fail(res, 'Session not found.', 404);
  await prisma.$transaction([prisma.session.updateMany({ data: { isCurrent: false } }), prisma.session.update({ where: { id }, data: { isCurrent: true } })]);
  res.json({ saved: true });
}));

const settingsSchema = z.object({
  attendanceThreshold: z.number({ invalid_type_error: 'Attendance limit must be a number.' }).int().min(1, 'Attendance limit must be 1 to 100.').max(100, 'Attendance limit must be 1 to 100.'),
  passPercent: z.number({ invalid_type_error: 'Pass percentage must be a number.' }).int().min(1, 'Pass percentage must be 1 to 100.').max(100, 'Pass percentage must be 1 to 100.'),
});

router.get('/settings', guard(async (_req, res) => res.json({ settings: await getSettings() })));

router.put('/settings', guard(async (req, res) => {
  const b = first(settingsSchema.safeParse(req.body), res);
  if (!b) return;
  await prisma.$transaction(Object.entries(b).map(([key, value]) => prisma.setting.upsert({ where: { key }, update: { value: String(value) }, create: { key, value: String(value) } })));
  res.json({ settings: await getSettings() });
}));

// ---------- faculty assignment (subject x section -> faculty) ----------
function classQuery(q) {
  return { courseId: Number(q.courseId), departmentId: q.departmentId ? Number(q.departmentId) : null, semester: Number(q.semester) };
}

router.get('/assignments', guard(async (req, res) => {
  const c = classQuery(req.query);
  const cls = await resolveClass(c);
  if (cls.error) return fail(res, cls.error);
  const session = await currentSession();
  if (!session) return fail(res, 'Create an academic session first.');
  const deptId = cls.department?.id ?? null;
  const subjects = await prisma.subject.findMany({ where: { courseId: c.courseId, departmentId: deptId, semester: c.semester }, orderBy: { code: 'asc' } });
  const [assignments, counts] = await Promise.all([
    prisma.assignment.findMany({ where: { sessionId: session.id, subjectId: { in: subjects.map((s) => s.id) } } }),
    prisma.student.groupBy({ by: ['section'], where: studentWhere({ courseId: c.courseId, departmentId: deptId, semester: c.semester }, null), _count: { _all: true } }),
  ]);
  res.json({
    session: { id: session.id, name: session.name },
    sections: SECTIONS,
    counts: Object.fromEntries(SECTIONS.map((s) => [s, counts.find((x) => x.section === s)?._count._all ?? 0])),
    subjects: subjects.map((s) => ({
      id: s.id, code: s.code, name: s.name,
      assigned: Object.fromEntries(SECTIONS.map((sec) => [sec, assignments.find((a) => a.subjectId === s.id && a.section === sec)?.teacherId ?? ''])),
    })),
  });
}));

router.put('/assignments', guard(async (req, res) => {
  const p = z.object({
    items: z.array(z.object({ subjectId: z.number().int(), section: z.enum(SECTIONS), teacherId: z.number().int().nullable() })).max(300),
  }).safeParse(req.body);
  if (!p.success) return fail(res, 'Invalid request.');
  const session = await currentSession();
  if (!session) return fail(res, 'Create an academic session first.');

  let saved = 0;
  for (const it of p.data.items) {
    const key = { subjectId_sessionId_section: { subjectId: it.subjectId, sessionId: session.id, section: it.section } };
    const existing = await prisma.assignment.findUnique({ where: key });
    if (it.teacherId === null) {
      if (!existing) continue;
      if (await prisma.lecture.count({ where: { assignmentId: existing.id } })) return fail(res, 'A subject with scheduled lectures cannot be unassigned. Delete its lectures first.', 409);
      await prisma.assignment.delete({ where: { id: existing.id } });
    } else {
      if (!(await prisma.teacher.findUnique({ where: { id: it.teacherId }, select: { id: true } }))) return fail(res, 'Choose a valid faculty member.');
      if (!(await prisma.subject.findUnique({ where: { id: it.subjectId }, select: { id: true } }))) return fail(res, 'Subject not found.', 404);
      await prisma.assignment.upsert({ where: key, update: { teacherId: it.teacherId }, create: { subjectId: it.subjectId, sessionId: session.id, section: it.section, teacherId: it.teacherId } });
    }
    saved += 1;
  }
  res.json({ saved });
}));

// ---------- class coordinators (one faculty member per section of a class) ----------
router.get('/coordinators', guard(async (req, res) => {
  const c = classQuery(req.query);
  const cls = await resolveClass(c);
  if (cls.error) return fail(res, cls.error);
  const session = await currentSession();
  if (!session) return fail(res, 'Create an academic session first.');
  const rows = await prisma.coordinator.findMany({ where: { sessionId: session.id, courseId: c.courseId, departmentId: cls.department?.id ?? null, semester: c.semester } });
  res.json({ sections: SECTIONS, assigned: Object.fromEntries(SECTIONS.map((sec) => [sec, rows.find((r) => r.section === sec)?.teacherId ?? ''])) });
}));

router.put('/coordinators', guard(async (req, res) => {
  const p = z.object({
    courseId: intId('Choose a course.'), departmentId: z.number().int().nullable().optional(), semester: intId('Choose a semester.'),
    items: z.array(z.object({ section: z.enum(SECTIONS), teacherId: z.number().int().nullable() })).max(SECTIONS.length),
  }).safeParse(req.body);
  if (!p.success) return fail(res, p.error.issues[0].message);
  const cls = await resolveClass(p.data);
  if (cls.error) return fail(res, cls.error);
  const session = await currentSession();
  if (!session) return fail(res, 'Create an academic session first.');
  const where = { sessionId: session.id, courseId: p.data.courseId, departmentId: cls.department?.id ?? null, semester: p.data.semester };

  for (const it of p.data.items) {
    const existing = await prisma.coordinator.findFirst({ where: { ...where, section: it.section } });
    if (it.teacherId === null) {
      if (existing) await prisma.coordinator.delete({ where: { id: existing.id } });
    } else {
      if (!(await prisma.teacher.findUnique({ where: { id: it.teacherId }, select: { id: true } }))) return fail(res, 'Choose a valid faculty member.');
      if (existing) await prisma.coordinator.update({ where: { id: existing.id }, data: { teacherId: it.teacherId } });
      else await prisma.coordinator.create({ data: { ...where, section: it.section, teacherId: it.teacherId } });
    }
  }
  res.json({ saved: p.data.items.length });
}));

// ---------- promotion (semester by semester) ----------
router.get('/promote', guard(async (req, res) => {
  const c = classQuery(req.query);
  const cls = await resolveClass(c);
  if (cls.error) return fail(res, cls.error);
  const section = SECTIONS.includes(req.query.section) ? req.query.section : null;
  const list = await prisma.student.findMany({
    where: studentWhere({ courseId: c.courseId, departmentId: cls.department?.id ?? null, semester: c.semester }, section),
    include: { user: { select: { name: true } } },
    orderBy: [{ section: 'asc' }, { enrollmentNo: 'asc' }],
  });
  res.json({
    max: cls.max,
    next: c.semester >= cls.max ? 'Passes out' : `Semester ${c.semester + 1}`,
    students: list.map((s) => ({ id: s.id, enrollmentNo: s.enrollmentNo, name: s.user.name, section: s.section })),
  });
}));

router.post('/promote', guard(async (req, res) => {
  const p = z.object({ studentIds: z.array(z.number().int()).min(1, 'Choose at least one student.').max(2000) }).safeParse(req.body);
  if (!p.success) return fail(res, p.error.issues[0].message);
  const students = await prisma.student.findMany({ where: { id: { in: p.data.studentIds }, status: 'ACTIVE' }, include: { course: true, department: true } });
  let promoted = 0;
  let passedOut = 0;
  const updates = students.map((s) => {
    if (s.semester >= maxSemester(s.course, s.department)) {
      passedOut += 1;
      return prisma.student.update({ where: { id: s.id }, data: { status: 'PASSED_OUT' } });
    }
    promoted += 1;
    return prisma.student.update({ where: { id: s.id }, data: { semester: { increment: 1 } } });
  });
  await prisma.$transaction(updates);
  res.json({ promoted, passedOut });
}));

export default router;
