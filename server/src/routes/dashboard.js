import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { addDays, iso, today } from '../lib/dates.js';
import { classLabel } from '../lib/classes.js';
import { guard } from '../lib/http.js';
import { assignmentLabel, listLectures, scopeOf } from '../lib/scope.js';
import { currentSession, getSettings } from '../lib/settings.js';
import { noticeWhere } from '../lib/noticeScope.js';
import { emptyCounts, groupToMap, rankFaculty, rate, sumCounts } from '../lib/stats.js';

const router = Router();
router.use(requireAuth);

function dailyTrend(rows, from, days) {
  const map = groupToMap(rows, 'date');
  return Array.from({ length: days }, (_, i) => {
    const date = iso(addDays(from, i));
    const c = map.get(date);
    return { date, rate: c ? rate(c) : null };
  });
}

function weeklyTrend(records, weeks) {
  const t = today();
  const monday = addDays(t, -((t.getUTCDay() + 6) % 7));
  const buckets = Array.from({ length: weeks }, (_, i) => ({ start: addDays(monday, -(weeks - 1 - i) * 7), counts: emptyCounts() }));
  for (const r of records) {
    const idx = Math.floor((r.date - buckets[0].start) / (7 * 86400000));
    if (idx >= 0 && idx < weeks) buckets[idx].counts[r.status]++;
  }
  return buckets.map((b) => ({ week: iso(b.start), rate: rate(b.counts) }));
}

async function latestNotices(user, courseId) {
  const list = await prisma.notice.findMany({ where: noticeWhere(user.role, courseId), orderBy: { createdAt: 'desc' }, take: 5 });
  return list.map((n) => ({ id: n.id, title: n.title, date: iso(n.createdAt) }));
}

router.get('/admin', requireRole('ADMIN'), guard(async (req, res) => {
  const t = today();
  const from = addDays(t, -13);
  const [session, settings] = await Promise.all([currentSession(), getSettings()]);
  const assignments = session ? await prisma.assignment.findMany({ where: { sessionId: session.id }, include: { subject: { select: { courseId: true } } } }) : [];
  const ids = assignments.map((a) => a.id);
  const sessionId = session?.id ?? -1;

  const [students, faculty, lecturesToday, trendRows, aRows, sRows, courses, ranking, demanded, paid, notices] = await Promise.all([
    prisma.student.count({ where: { status: 'ACTIVE' } }),
    prisma.teacher.count(),
    prisma.lecture.count({ where: { date: t, suspended: false, assignmentId: { in: ids } } }),
    prisma.attendance.groupBy({ by: ['date', 'status'], where: { date: { gte: from, lte: t }, assignmentId: { in: ids } }, _count: { _all: true } }),
    prisma.attendance.groupBy({ by: ['assignmentId', 'status'], where: { assignmentId: { in: ids } }, _count: { _all: true } }),
    prisma.attendance.groupBy({ by: ['studentId', 'status'], where: { assignmentId: { in: ids } }, _count: { _all: true } }),
    prisma.course.findMany({ select: { id: true, code: true }, orderBy: { code: 'asc' } }),
    session ? rankFaculty(session.id) : [],
    prisma.feeDemand.aggregate({ where: { sessionId }, _sum: { amount: true } }),
    prisma.payment.aggregate({ where: { demand: { sessionId } }, _sum: { amount: true } }),
    latestNotices(req.user, null),
  ]);

  const byAssignment = groupToMap(aRows, 'assignmentId');
  const courseOf = new Map(assignments.map((a) => [a.id, a.subject.courseId]));
  const byCourse = new Map();
  for (const [aid, counts] of byAssignment) {
    const cid = courseOf.get(aid);
    byCourse.set(cid, sumCounts([byCourse.get(cid) ?? emptyCounts(), counts]));
  }
  const low = [...groupToMap(sRows, 'studentId').values()].filter((c) => {
    const r = rate(c);
    return r !== null && r < settings.attendanceThreshold;
  }).length;
  const owed = (demanded._sum.amount ?? 0) - (paid._sum.amount ?? 0);

  res.json({
    session: session?.name ?? null,
    threshold: settings.attendanceThreshold,
    kpis: {
      students, faculty, lecturesToday, lowStudents: low,
      overallRate: rate(sumCounts([...byAssignment.values()])),
      feesDue: owed,
    },
    trend: dailyTrend(trendRows, from, 14),
    courses: courses.map((c) => ({ code: c.code, rate: byCourse.has(c.id) ? rate(byCourse.get(c.id)) : null })),
    topFaculty: ranking.slice(0, 5),
    notices,
  });
}));

router.get('/faculty', requireRole('TEACHER'), guard(async (req, res) => {
  const { session, teacher, assignments } = await scopeOf(req.user);
  if (!teacher) return res.status(404).json({ error: 'No faculty profile is linked to this account.' });
  const settings = await getSettings();
  const ids = assignments.map((a) => a.id);
  const t = today();
  const from = addDays(t, -29);
  const [lectures, trendRows, aRows, ranking, notices] = await Promise.all([
    listLectures({ assignmentIds: ids, from: addDays(t, -7), to: addDays(t, 7) }),
    prisma.attendance.groupBy({ by: ['date', 'status'], where: { assignmentId: { in: ids }, date: { gte: from, lte: t } }, _count: { _all: true } }),
    prisma.attendance.groupBy({ by: ['assignmentId', 'status'], where: { assignmentId: { in: ids } }, _count: { _all: true } }),
    session ? rankFaculty(session.id) : [],
    latestNotices(req.user, null),
  ]);
  const byAssignment = groupToMap(aRows, 'assignmentId');
  const todayIso = iso(t);
  const myIndex = ranking.findIndex((r) => r.teacherId === teacher.id);

  res.json({
    session: session?.name ?? null,
    today: todayIso,
    threshold: settings.attendanceThreshold,
    kpis: {
      subjects: assignments.length,
      lecturesToday: lectures.filter((l) => l.date === todayIso && !l.suspended).length,
      pendingMarking: lectures.filter((l) => l.date <= todayIso && !l.marked && !l.suspended).length,
      overallRate: rate(sumCounts([...byAssignment.values()])),
      rank: myIndex >= 0 ? myIndex + 1 : null,
      facultyCount: ranking.length,
    },
    lectures,
    trend: dailyTrend(trendRows, from, 30),
    subjects: assignments.map((a) => ({
      id: a.id, code: `${a.subject.code}-${a.section}`, title: assignmentLabel(a),
      rate: byAssignment.has(a.id) ? rate(byAssignment.get(a.id)) : null,
    })),
    topFaculty: ranking.slice(0, 5),
    myTeacherId: teacher.id,
    notices,
  });
}));

router.get('/student', requireRole('STUDENT'), guard(async (req, res) => {
  const { session, student, assignments } = await scopeOf(req.user);
  if (!student) return res.status(404).json({ error: 'No student profile is linked to this account.' });
  const settings = await getSettings();
  const t = today();
  const ids = assignments.map((a) => a.id);

  const [aRows, weekly, recent, upcoming, demanded, paid, notices] = await Promise.all([
    prisma.attendance.groupBy({ by: ['assignmentId', 'status'], where: { studentId: student.id, assignmentId: { in: ids } }, _count: { _all: true } }),
    prisma.attendance.findMany({ where: { studentId: student.id, assignmentId: { in: ids }, date: { gte: addDays(t, -56) } }, select: { date: true, status: true } }),
    prisma.attendance.findMany({ where: { studentId: student.id }, orderBy: [{ date: 'desc' }, { id: 'desc' }], take: 10, include: { assignment: { include: { subject: true } } } }),
    listLectures({ assignmentIds: ids, from: t, to: addDays(t, 7) }),
    prisma.feeDemand.aggregate({ where: { studentId: student.id }, _sum: { amount: true } }),
    prisma.payment.aggregate({ where: { demand: { studentId: student.id } }, _sum: { amount: true } }),
    latestNotices(req.user, student.courseId),
  ]);
  const byAssignment = groupToMap(aRows, 'assignmentId');
  const total = sumCounts([...byAssignment.values()]);

  res.json({
    session: session?.name ?? null,
    today: iso(t),
    threshold: settings.attendanceThreshold,
    student: {
      enrollmentNo: student.enrollmentNo,
      classLabel: classLabel({ course: student.course, department: student.department, semester: student.semester, section: student.section }),
    },
    kpis: {
      overallRate: rate(total), present: total.PRESENT, absent: total.ABSENT, late: total.LATE, excused: total.EXCUSED,
      subjects: assignments.length,
      feesDue: (demanded._sum.amount ?? 0) - (paid._sum.amount ?? 0),
    },
    subjects: assignments.map((a) => {
      const c = byAssignment.get(a.id) ?? emptyCounts();
      return { code: a.subject.code, title: a.subject.name, faculty: a.teacher.user.name, rate: rate(c), attended: c.PRESENT + c.LATE, total: c.PRESENT + c.LATE + c.ABSENT };
    }),
    weekly: weeklyTrend(weekly, 8),
    recent: recent.map((r) => ({ id: r.id, date: iso(r.date), subject: r.assignment.subject.code, subjectName: r.assignment.subject.name, status: r.status })),
    upcoming,
    notices,
  });
}));

export default router;
