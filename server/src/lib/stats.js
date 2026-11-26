import { prisma } from './prisma.js';
import { iso, today } from './dates.js';

export const emptyCounts = () => ({ PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 });

export function sumCounts(list) {
  const out = emptyCounts();
  for (const c of list) for (const k of Object.keys(out)) out[k] += c[k];
  return out;
}

// Attendance rate = (present + late) / (present + late + absent). Excused days are left out.
export function rate(c) {
  const total = c.PRESENT + c.ABSENT + c.LATE;
  return total ? Math.round(((c.PRESENT + c.LATE) / total) * 1000) / 10 : null;
}

// Turns prisma groupBy rows ({ [keyField], status, _count }) into Map(key -> counts).
export function groupToMap(rows, keyField) {
  const map = new Map();
  for (const r of rows) {
    const key = r[keyField] instanceof Date ? iso(r[keyField]) : r[keyField];
    const c = map.get(key) ?? emptyCounts();
    c[r.status] += r._count._all;
    map.set(key, c);
  }
  return map;
}

// Faculty ranked by the average attendance rate in the classes they teach this session.
export async function rankFaculty(sessionId) {
  const assignments = await prisma.assignment.findMany({
    where: { sessionId },
    select: { id: true, teacherId: true, teacher: { select: { employeeCode: true, user: { select: { name: true } } } } },
  });
  const ids = assignments.map((a) => a.id);
  const [rows, held] = await Promise.all([
    prisma.attendance.groupBy({ by: ['assignmentId', 'status'], where: { assignmentId: { in: ids } }, _count: { _all: true } }),
    prisma.lecture.groupBy({ by: ['assignmentId'], where: { assignmentId: { in: ids }, date: { lt: today() } }, _count: { _all: true } }),
  ]);
  const byAssignment = groupToMap(rows, 'assignmentId');
  const heldMap = new Map(held.map((h) => [h.assignmentId, h._count._all]));
  const teachers = new Map();
  for (const a of assignments) {
    const t = teachers.get(a.teacherId) ?? { teacherId: a.teacherId, name: a.teacher.user.name, employeeCode: a.teacher.employeeCode, counts: [], lecturesHeld: 0 };
    t.counts.push(byAssignment.get(a.id) ?? emptyCounts());
    t.lecturesHeld += heldMap.get(a.id) ?? 0;
    teachers.set(a.teacherId, t);
  }
  return [...teachers.values()]
    .map((t) => ({ teacherId: t.teacherId, name: t.name, employeeCode: t.employeeCode, lecturesHeld: t.lecturesHeld, rate: rate(sumCounts(t.counts)) }))
    .filter((t) => t.rate !== null)
    .sort((a, b) => b.rate - a.rate);
}
