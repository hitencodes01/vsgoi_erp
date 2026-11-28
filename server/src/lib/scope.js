import { prisma } from './prisma.js';
import { classLabel } from './classes.js';
import { iso } from './dates.js';
import { currentSession } from './settings.js';

const subjectInclude = { include: { course: true, department: true } };
export const assignmentInclude = {
  subject: subjectInclude,
  teacher: { include: { user: { select: { name: true } } } },
};

export const assignmentLabel = (a, withSection = true) =>
  `${a.subject.code} · ${a.subject.name} · ${classLabel({ course: a.subject.course, department: a.subject.department, semester: a.subject.semester, section: withSection ? a.section : null })}`;

// Which assignments (subject + section + faculty) the signed-in user can see.
// Admin: all. Faculty: their own. Student: the subjects of their current class.
export async function scopeOf(user, { allSessions = false } = {}) {
  const session = await currentSession();
  const sessionWhere = allSessions || !session ? {} : { sessionId: session.id };
  let teacher = null;
  let student = null;
  let where = sessionWhere;

  if (user.role === 'TEACHER') {
    teacher = await prisma.teacher.findUnique({ where: { userId: user.id } });
    where = { ...sessionWhere, teacherId: teacher?.id ?? -1 };
  } else if (user.role === 'STUDENT') {
    student = await prisma.student.findUnique({ where: { userId: user.id }, include: { course: true, department: true } });
    where = student
      ? { ...sessionWhere, section: student.section, subject: { courseId: student.courseId, departmentId: student.departmentId, semester: student.semester } }
      : { id: -1 };
  }
  const assignments = await prisma.assignment.findMany({ where, include: assignmentInclude });
  return { session, teacher, student, assignments };
}

// Lectures (with a "marked" flag) for a set of assignments between two dates.
export async function listLectures({ assignmentIds, from, to }) {
  if (!assignmentIds.length) return [];
  const lectures = await prisma.lecture.findMany({
    where: { assignmentId: { in: assignmentIds }, date: { gte: from, lte: to } },
    include: { assignment: { include: assignmentInclude } },
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
  });
  const marked = await prisma.attendance.groupBy({ by: ['lectureId'], where: { lectureId: { in: lectures.map((l) => l.id) } }, _count: { _all: true } });
  const done = new Set(marked.map((m) => m.lectureId));
  return lectures.map((l) => ({
    id: l.id,
    assignmentId: l.assignmentId,
    date: iso(l.date),
    startTime: l.startTime,
    endTime: l.endTime,
    room: l.room,
    topic: l.topic,
    suspended: l.suspended,
    suspendReason: l.suspendReason ?? '',
    subject: `${l.assignment.subject.code} · ${l.assignment.subject.name}`,
    classLabel: classLabel({ course: l.assignment.subject.course, department: l.assignment.subject.department, semester: l.assignment.subject.semester, section: l.assignment.section }),
    teacher: l.assignment.teacher.user.name,
    marked: done.has(l.id),
  }));
}
