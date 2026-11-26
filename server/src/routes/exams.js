import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { iso, parseDate } from '../lib/dates.js';
import { classLabel, studentWhere } from '../lib/classes.js';
import { fail, guard, idOf } from '../lib/http.js';
import { getSettings } from '../lib/settings.js';
import { assignmentInclude, assignmentLabel, scopeOf } from '../lib/scope.js';

const router = Router();
router.use(requireAuth);
const staff = requireRole('ADMIN', 'TEACHER');

const examInclude = { assignment: { include: { ...assignmentInclude, session: true } }, _count: { select: { marks: true } } };

// ---------- student: results ----------
router.get('/results/mine', requireRole('STUDENT'), guard(async (req, res) => {
  const student = await prisma.student.findUnique({ where: { userId: req.user.id } });
  const { passPercent } = await getSettings();
  const marks = await prisma.mark.findMany({
    where: { studentId: student?.id ?? -1 },
    include: { exam: { include: { assignment: { include: { subject: true, session: true } } } } },
    orderBy: { exam: { id: 'asc' } },
  });
  const sems = new Map();
  for (const m of marks) {
    const sub = m.exam.assignment.subject;
    const sem = sems.get(sub.semester) ?? new Map();
    const row = sem.get(sub.id) ?? { code: sub.code, name: sub.name, exams: [], obtained: 0, max: 0 };
    row.exams.push({ name: m.exam.name, score: m.score, max: m.exam.maxMarks });
    row.obtained += m.score;
    row.max += m.exam.maxMarks;
    sem.set(sub.id, row);
    sems.set(sub.semester, sem);
  }
  const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);
  const semesters = [...sems.entries()].sort((a, b) => b[0] - a[0]).map(([semester, subjects]) => {
    const list = [...subjects.values()].map((s) => ({ ...s, percent: pct(s.obtained, s.max), pass: pct(s.obtained, s.max) >= passPercent }));
    const obtained = list.reduce((x, s) => x + s.obtained, 0);
    const max = list.reduce((x, s) => x + s.max, 0);
    return { semester, subjects: list, obtained, max, percent: pct(obtained, max), pass: list.every((s) => s.pass) };
  });
  res.json({ passPercent, semesters });
}));

// ---------- faculty / admin ----------
async function rosterOf(exam) {
  const a = exam.assignment;
  const include = { user: { select: { name: true } } };
  const [matching, marks] = await Promise.all([
    prisma.student.findMany({ where: studentWhere(a.subject, a.section), include }),
    prisma.mark.findMany({ where: { examId: exam.id }, include: { student: { include } } }),
  ]);
  const byId = new Map(matching.map((s) => [s.id, s]));
  for (const m of marks) byId.set(m.studentId, m.student);
  const score = new Map(marks.map((m) => [m.studentId, m.score]));
  return [...byId.values()].sort((x, y) => x.enrollmentNo.localeCompare(y.enrollmentNo)).map((s) => ({ studentId: s.id, name: s.user.name, enrollmentNo: s.enrollmentNo, score: score.get(s.id) ?? null }));
}

async function examFor(req, res) {
  const id = idOf(req);
  const exam = id && (await prisma.exam.findUnique({ where: { id }, include: examInclude }));
  if (!exam) return void fail(res, 'Exam not found.', 404);
  if (req.user.role === 'TEACHER' && exam.assignment.teacher.userId !== req.user.id) return void fail(res, 'You can only manage your own exams.', 403);
  return exam;
}

router.get('/', staff, guard(async (req, res) => {
  const { assignments } = await scopeOf(req.user);
  const where = req.user.role === 'TEACHER' ? { assignment: { teacher: { userId: req.user.id } } } : {};
  const exams = await prisma.exam.findMany({ where, include: examInclude, orderBy: { id: 'desc' }, take: 500 });
  res.json({
    options: assignments.map((a) => ({ id: a.id, label: assignmentLabel(a) })),
    rows: exams.map((e) => ({
      id: e.id, name: e.name, subject: `${e.assignment.subject.code} · ${e.assignment.subject.name}`,
      class: classLabel({ course: e.assignment.subject.course, department: e.assignment.subject.department, semester: e.assignment.subject.semester, section: e.assignment.section }),
      session: e.assignment.session.name, maxMarks: e.maxMarks, date: e.date ? iso(e.date) : '', marksEntered: e._count.marks,
    })),
  });
}));

const examSchema = z.object({
  assignmentId: z.number({ invalid_type_error: 'Choose a subject.', required_error: 'Choose a subject.' }).int(),
  name: z.string().trim().min(2, 'Enter the exam name, like Mid Sem 1.').max(100, 'The name is too long.'),
  maxMarks: z.number({ invalid_type_error: 'Maximum marks must be a number.' }).int().min(1, 'Maximum marks must be at least 1.').max(1000, 'Maximum marks is too large.'),
  date: z.string().optional(),
});

function examInput(req, res) {
  const p = examSchema.safeParse(req.body);
  if (!p.success) return void fail(res, p.error.issues[0].message);
  let date = null;
  if (p.data.date) {
    date = parseDate(p.data.date);
    if (!date) return void fail(res, 'Enter a valid date.');
  }
  return { ...p.data, date };
}

router.post('/', staff, guard(async (req, res) => {
  const b = examInput(req, res);
  if (!b) return;
  const a = await prisma.assignment.findUnique({ where: { id: b.assignmentId }, include: { teacher: true } });
  if (!a) return fail(res, 'Choose a valid subject.');
  if (req.user.role === 'TEACHER' && a.teacher.userId !== req.user.id) return fail(res, 'You can only create exams for your own subjects.', 403);
  const e = await prisma.exam.create({ data: { assignmentId: b.assignmentId, name: b.name, maxMarks: b.maxMarks, date: b.date } });
  res.status(201).json({ id: e.id });
}));

router.get('/:id', staff, guard(async (req, res) => {
  const exam = await examFor(req, res);
  if (!exam) return;
  const a = exam.assignment;
  res.json({
    exam: {
      id: exam.id, name: exam.name, maxMarks: exam.maxMarks, date: exam.date ? iso(exam.date) : '', assignmentId: exam.assignmentId,
      subject: `${a.subject.code} · ${a.subject.name}`,
      classLabel: classLabel({ course: a.subject.course, department: a.subject.department, semester: a.subject.semester, section: a.section }),
    },
    students: await rosterOf(exam),
  });
}));

router.put('/:id', staff, guard(async (req, res) => {
  const exam = await examFor(req, res);
  if (!exam) return;
  const b = examInput(req, res);
  if (!b) return;
  if (b.assignmentId !== exam.assignmentId) return fail(res, 'The subject of an exam cannot change.');
  const top = await prisma.mark.aggregate({ where: { examId: exam.id }, _max: { score: true } });
  if ((top._max.score ?? 0) > b.maxMarks) return fail(res, `A student already has ${top._max.score}, so maximum marks cannot be lower.`, 409);
  await prisma.exam.update({ where: { id: exam.id }, data: { name: b.name, maxMarks: b.maxMarks, date: b.date } });
  res.json({ saved: true });
}));

const marksSchema = z.object({ scores: z.array(z.object({ studentId: z.number().int(), score: z.number().nullable() })).min(1) });

router.put('/:id/marks', staff, guard(async (req, res) => {
  const exam = await examFor(req, res);
  if (!exam) return;
  const p = marksSchema.safeParse(req.body);
  if (!p.success) return fail(res, 'Send a score (or leave it empty) for each student.');
  const allowed = new Set((await rosterOf(exam)).map((s) => s.studentId));
  for (const s of p.data.scores) {
    if (!allowed.has(s.studentId)) return fail(res, 'One or more students do not belong to this class.');
    if (s.score !== null && (s.score < 0 || s.score > exam.maxMarks)) return fail(res, `Marks must be between 0 and ${exam.maxMarks}.`);
  }
  await prisma.$transaction(p.data.scores.map((s) => s.score === null
    ? prisma.mark.deleteMany({ where: { examId: exam.id, studentId: s.studentId } })
    : prisma.mark.upsert({ where: { examId_studentId: { examId: exam.id, studentId: s.studentId } }, update: { score: s.score }, create: { examId: exam.id, studentId: s.studentId, score: s.score } })));
  res.json({ saved: p.data.scores.length });
}));

router.delete('/:id', staff, guard(async (req, res) => {
  const exam = await examFor(req, res);
  if (!exam) return;
  await prisma.exam.delete({ where: { id: exam.id } });
  res.json({ deleted: true });
}));

export default router;
