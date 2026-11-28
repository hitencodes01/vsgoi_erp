import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { addDays, iso, parseDate, today } from '../lib/dates.js';
import { fail, guard, idOf } from '../lib/http.js';
import { assignmentLabel, listLectures, scopeOf } from '../lib/scope.js';

const router = Router();
router.use(requireAuth);

// Lectures visible to the signed-in user (admin: all, faculty: own, student: their class).
router.get('/', guard(async (req, res) => {
  const t = today();
  const from = parseDate(req.query.from) ?? addDays(t, -7);
  const to = parseDate(req.query.to) ?? addDays(t, 14);
  const { assignments } = await scopeOf(req.user);
  const wanted = Number(req.query.assignmentId);
  let ids = assignments.map((a) => a.id);
  if (Number.isInteger(wanted) && wanted > 0) ids = ids.filter((i) => i === wanted);
  res.json({
    today: iso(t),
    options: assignments.map((a) => ({ id: a.id, label: assignmentLabel(a) })),
    lectures: await listLectures({ assignmentIds: ids, from, to }),
  });
}));

const manage = requireRole('ADMIN', 'TEACHER');

router.get('/options', manage, guard(async (req, res) => {
  const { assignments } = await scopeOf(req.user);
  res.json({ options: assignments.map((a) => ({ id: a.id, label: assignmentLabel(a) })) });
}));

// ---------- scheduling (admin: any subject, faculty: own subjects) ----------
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 09:30.');
const schema = z.object({
  assignmentId: z.number({ invalid_type_error: 'Choose a subject.', required_error: 'Choose a subject.' }).int(),
  date: z.string(),
  startTime: time,
  endTime: time,
  room: z.string().trim().max(50, 'Room name is too long.').optional(),
  topic: z.string().trim().max(200, 'Topic is too long.').optional(),
  repeatWeeks: z.number().int().min(0).max(40, 'Repeat at most 40 weeks.').optional(),
});

async function assignmentFor(req, id) {
  const a = await prisma.assignment.findUnique({ where: { id }, include: { subject: true, teacher: true } });
  if (!a) return { error: 'Choose a valid subject.' };
  if (req.user.role === 'TEACHER' && a.teacher.userId !== req.user.id) return { error: 'You can only schedule your own subjects.', status: 403 };
  return { assignment: a };
}

function input(req, res) {
  const p = schema.safeParse(req.body);
  if (!p.success) return void fail(res, p.error.issues[0].message);
  const date = parseDate(p.data.date);
  if (!date) return void fail(res, 'Enter a valid date.');
  if (p.data.endTime <= p.data.startTime) return void fail(res, 'End time must be after the start time.');
  return { ...p.data, date, room: p.data.room || null, topic: p.data.topic || null };
}

// Same faculty, same class (course + department + semester + section) or same room at overlapping times.
async function findConflict({ assignment, date, startTime, endTime, room, ignoreId }) {
  const overlapping = await prisma.lecture.findMany({
    // A suspended lecture is not happening, so it does not block the faculty, class or room.
    where: { date, suspended: false, ...(ignoreId ? { id: { not: ignoreId } } : {}), startTime: { lt: endTime }, endTime: { gt: startTime } },
    include: { assignment: { include: { subject: true } } },
  });
  const mine = assignment.subject;
  for (const l of overlapping) {
    const a = l.assignment;
    const slot = `${a.subject.code} (${l.startTime}–${l.endTime}) on ${iso(date)}`;
    if (a.teacherId === assignment.teacherId) return `The faculty member is already teaching ${slot}.`;
    const sameClass = a.section === assignment.section && a.subject.courseId === mine.courseId && a.subject.departmentId === mine.departmentId && a.subject.semester === mine.semester;
    if (sameClass) return `That class already has ${slot}.`;
    if (room && l.room && l.room.toLowerCase() === room.toLowerCase()) return `${room} is already booked for ${slot}.`;
  }
  return null;
}

const hasAttendance = async (lectureId) => (await prisma.attendance.count({ where: { lectureId } })) > 0;

router.post('/', manage, guard(async (req, res) => {
  const b = input(req, res);
  if (!b) return;
  const r = await assignmentFor(req, b.assignmentId);
  if (r.error) return fail(res, r.error, r.status);
  const rows = Array.from({ length: (b.repeatWeeks ?? 0) + 1 }, (_, i) => ({
    assignmentId: b.assignmentId, date: addDays(b.date, i * 7), startTime: b.startTime, endTime: b.endTime, room: b.room, topic: i === 0 ? b.topic : null,
  }));
  for (const row of rows) {
    const clash = await findConflict({ ...row, assignment: r.assignment });
    if (clash) return fail(res, clash, 409);
  }
  await prisma.lecture.createMany({ data: rows });
  res.status(201).json({ created: rows.length });
}));

async function lectureFor(req, res) {
  const id = idOf(req);
  const l = id && (await prisma.lecture.findUnique({ where: { id }, include: { assignment: { include: { teacher: true, subject: true } } } }));
  if (!l) return void fail(res, 'Lecture not found.', 404);
  if (req.user.role === 'TEACHER' && l.assignment.teacher.userId !== req.user.id) return void fail(res, 'You can only change your own lectures.', 403);
  return l;
}

router.get('/:id', manage, guard(async (req, res) => {
  const l = await lectureFor(req, res);
  if (!l) return;
  res.json({ item: { id: l.id, assignmentId: l.assignmentId, date: iso(l.date), startTime: l.startTime, endTime: l.endTime, room: l.room ?? '', topic: l.topic ?? '', suspended: l.suspended, suspendReason: l.suspendReason ?? '', marked: await hasAttendance(l.id) } });
}));

router.put('/:id', manage, guard(async (req, res) => {
  const b = input(req, res);
  if (!b) return;
  const l = await lectureFor(req, res);
  if (!l) return;
  const r = await assignmentFor(req, b.assignmentId);
  if (r.error) return fail(res, r.error, r.status);
  const moved = b.assignmentId !== l.assignmentId || b.date.getTime() !== l.date.getTime();
  if (moved && (await hasAttendance(l.id))) {
    return fail(res, 'Attendance was already marked, so the subject and date cannot change. You can still change the time, room or topic.', 409);
  }
  const clash = await findConflict({ ...b, assignment: r.assignment, ignoreId: l.id });
  if (clash) return fail(res, clash, 409);
  await prisma.lecture.update({ where: { id: l.id }, data: { assignmentId: b.assignmentId, date: b.date, startTime: b.startTime, endTime: b.endTime, room: b.room, topic: b.topic } });
  res.json({ saved: true });
}));

// Suspend a lecture that will not take place (faculty on leave, holiday) without deleting it, or resume it.
// Students see it as suspended, attendance cannot be marked for it and it is left out of the attendance numbers.
router.patch('/:id/suspend', manage, guard(async (req, res) => {
  const p = z.object({ suspended: z.boolean(), reason: z.string().trim().max(200, 'The reason is too long.').optional() }).safeParse(req.body);
  if (!p.success) return fail(res, p.error.issues[0].message);
  const l = await lectureFor(req, res);
  if (!l) return;
  if (p.data.suspended) {
    if (await hasAttendance(l.id)) return fail(res, 'Attendance was already marked for this lecture, so it cannot be suspended.', 409);
  } else {
    const clash = await findConflict({ assignment: l.assignment, date: l.date, startTime: l.startTime, endTime: l.endTime, room: l.room, ignoreId: l.id });
    if (clash) return fail(res, `It cannot be resumed. ${clash}`, 409);
  }
  await prisma.lecture.update({ where: { id: l.id }, data: { suspended: p.data.suspended, suspendReason: p.data.suspended ? p.data.reason || null : null } });
  res.json({ suspended: p.data.suspended });
}));

router.delete('/:id', manage, guard(async (req, res) => {
  const l = await lectureFor(req, res);
  if (!l) return;
  if (await hasAttendance(l.id)) return fail(res, 'Attendance has been marked for this lecture, so it cannot be deleted.', 409);
  await prisma.lecture.delete({ where: { id: l.id } });
  res.json({ deleted: true });
}));

export default router;
