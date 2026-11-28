import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { iso, parseDate, today } from '../lib/dates.js';
import { classLabel, studentWhere } from '../lib/classes.js';
import { fail, guard, idOf } from '../lib/http.js';
import { assignmentInclude, assignmentLabel, scopeOf } from '../lib/scope.js';
import { emptyCounts, groupToMap, rate } from '../lib/stats.js';

const router = Router();
router.use(requireAuth);

const STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'];

// Attendance records, limited to what the signed-in user may see.
router.get('/records', guard(async (req, res) => {
  const { status, from, to } = req.query;
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const assignmentId = Number(req.query.assignmentId) || null;
  if (status && !STATUSES.includes(status)) return fail(res, 'Invalid status.');

  const where = {};
  let options;
  if (req.user.role === 'STUDENT') {
    const student = await prisma.student.findUnique({ where: { userId: req.user.id } });
    where.studentId = student?.id ?? -1;
    const ids = (await prisma.attendance.groupBy({ by: ['assignmentId'], where: { studentId: where.studentId } })).map((g) => g.assignmentId);
    options = await prisma.assignment.findMany({ where: { id: { in: ids } }, include: assignmentInclude });
  } else {
    options = (await scopeOf(req.user, { allSessions: true })).assignments;
    if (req.user.role === 'TEACHER') where.assignmentId = { in: options.map((a) => a.id) };
  }
  if (assignmentId) {
    if (!options.some((a) => a.id === assignmentId)) return fail(res, 'You do not have access to that subject.', 403);
    where.assignmentId = assignmentId;
  }
  if (status) where.status = status;
  const gte = parseDate(from);
  const lte = parseDate(to);
  if (gte || lte) where.date = { ...(gte && { gte }), ...(lte && { lte }) };

  const [records, grouped] = await Promise.all([
    prisma.attendance.findMany({
      where, orderBy: [{ date: 'desc' }, { id: 'desc' }], take: limit,
      include: { student: { select: { enrollmentNo: true, user: { select: { name: true } } } }, assignment: { include: { subject: true } } },
    }),
    prisma.attendance.groupBy({ by: ['status'], where, _count: { _all: true } }),
  ]);
  const counts = groupToMap(grouped.map((g) => ({ ...g, k: 'all' })), 'k').get('all') ?? emptyCounts();
  res.json({
    records: records.map((r) => ({
      id: r.id, date: iso(r.date), status: r.status, subject: `${r.assignment.subject.code} · ${r.assignment.subject.name}`,
      section: r.assignment.section, studentName: r.student.user.name, enrollmentNo: r.student.enrollmentNo,
    })),
    summary: { ...counts, rate: rate(counts), total: counts.PRESENT + counts.ABSENT + counts.LATE + counts.EXCUSED },
    assignments: options.map((a) => ({ id: a.id, label: assignmentLabel(a) })),
    limit,
  });
}));

// ---------- marking (admin or the faculty who teaches the lecture) ----------
async function authorizedLecture(req, res) {
  const id = idOf(req);
  const lecture = id && (await prisma.lecture.findUnique({ where: { id }, include: { assignment: { include: assignmentInclude } } }));
  if (!lecture) return void fail(res, 'Lecture not found.', 404);
  if (req.user.role === 'TEACHER' && lecture.assignment.teacher.userId !== req.user.id) {
    return void fail(res, 'You can only mark attendance for your own lectures.', 403);
  }
  return lecture;
}

// Students of the class, plus anyone who already has a mark (for example after being promoted).
async function rosterOf(lecture) {
  const a = lecture.assignment;
  const include = { user: { select: { name: true } } };
  const [matching, existing] = await Promise.all([
    prisma.student.findMany({ where: studentWhere(a.subject, a.section), include }),
    prisma.attendance.findMany({ where: { lectureId: lecture.id }, include: { student: { include } } }),
  ]);
  const byId = new Map(matching.map((s) => [s.id, s]));
  for (const e of existing) byId.set(e.studentId, e.student);
  const status = new Map(existing.map((e) => [e.studentId, e.status]));
  return {
    students: [...byId.values()].sort((x, y) => x.enrollmentNo.localeCompare(y.enrollmentNo)).map((s) => ({ studentId: s.id, name: s.user.name, enrollmentNo: s.enrollmentNo, status: status.get(s.id) ?? null })),
    marked: existing.length > 0,
  };
}

router.get('/lectures/:id', requireRole('ADMIN', 'TEACHER'), guard(async (req, res) => {
  const lecture = await authorizedLecture(req, res);
  if (!lecture) return;
  const a = lecture.assignment;
  const { students, marked } = await rosterOf(lecture);
  res.json({
    lecture: {
      id: lecture.id,
      subject: `${a.subject.code} · ${a.subject.name}`,
      classLabel: classLabel({ course: a.subject.course, department: a.subject.department, semester: a.subject.semester, section: a.section }),
      date: iso(lecture.date), startTime: lecture.startTime, endTime: lecture.endTime, room: lecture.room,
      editable: lecture.date <= today() && !lecture.suspended, suspended: lecture.suspended, suspendReason: lecture.suspendReason ?? '', alreadyMarked: marked,
    },
    students,
  });
}));

const saveSchema = z.object({ records: z.array(z.object({ studentId: z.number().int(), status: z.enum(STATUSES) })).min(1) });

router.put('/lectures/:id', requireRole('ADMIN', 'TEACHER'), guard(async (req, res) => {
  const lecture = await authorizedLecture(req, res);
  if (!lecture) return;
  if (lecture.suspended) return fail(res, 'This lecture is suspended, so attendance cannot be marked. Resume it first.', 409);
  if (lecture.date > today()) return fail(res, 'You can only mark attendance for today or past lectures.');
  const p = saveSchema.safeParse(req.body);
  if (!p.success) return fail(res, 'Send a status for each student.');

  const allowed = new Set((await rosterOf(lecture)).students.map((s) => s.studentId));
  if (p.data.records.some((r) => !allowed.has(r.studentId))) return fail(res, 'One or more students do not belong to this class.');

  await prisma.$transaction(p.data.records.map((r) =>
    prisma.attendance.upsert({
      where: { lectureId_studentId: { lectureId: lecture.id, studentId: r.studentId } },
      update: { status: r.status },
      create: { lectureId: lecture.id, studentId: r.studentId, assignmentId: lecture.assignmentId, date: lecture.date, status: r.status },
    })
  ));
  res.json({ saved: p.data.records.length });
}));

export default router;
