import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { classLabel, studentWhere } from '../lib/classes.js';
import { coordinatedClasses } from '../lib/coordinator.js';
import { fail, guard, idOf } from '../lib/http.js';
import { contactFields } from './people.js';

// "My class": faculty who are class coordinators see the students of their class and keep their personal details up to date.
// Everything else about a student (class, status, login email) stays with the admin.
const router = Router();
router.use(requireAuth, requireRole('TEACHER'));

const labelOf = (c) => classLabel({ course: c.course, department: c.department, semester: c.semester, section: c.section });
const classMatch = (c) => ({ courseId: c.courseId, departmentId: c.departmentId, semester: c.semester, section: c.section, status: 'ACTIVE' });
// Only the fields that were sent are changed; an empty value clears the field.
const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k] === '' ? null : obj[k]]));

router.get('/', guard(async (req, res) => {
  const classes = await coordinatedClasses(req.user.id);
  const out = [];
  for (const c of classes) {
    const students = await prisma.student.findMany({
      where: studentWhere({ courseId: c.courseId, departmentId: c.departmentId, semester: c.semester }, c.section),
      include: { user: true }, orderBy: { enrollmentNo: 'asc' },
    });
    out.push({
      id: c.id, label: labelOf(c),
      students: students.map((s) => ({ id: s.id, enrollmentNo: s.enrollmentNo, name: s.user.name, contact: s.user.phone ?? '', fatherName: s.fatherName ?? '', personalEmail: s.personalEmail ?? '' })),
    });
  }
  res.json({ classes: out });
}));

// Only students that sit in one of this faculty member's classes.
async function myStudent(req, res) {
  const id = idOf(req);
  const classes = await coordinatedClasses(req.user.id);
  const s = id && classes.length && (await prisma.student.findFirst({ where: { id, OR: classes.map(classMatch) }, include: { user: true, course: true, department: true } }));
  if (!s) return void fail(res, 'That student is not in a class you coordinate.', 404);
  return s;
}

router.get('/students/:id', guard(async (req, res) => {
  const s = await myStudent(req, res);
  if (!s) return;
  res.json({
    item: {
      id: s.id, name: s.user.name, enrollmentNo: s.enrollmentNo, classLabel: classLabel({ course: s.course, department: s.department, semester: s.semester, section: s.section }),
      phone: s.user.phone ?? '', city: s.user.city ?? '', address: s.user.address ?? '',
      alternateContact: s.alternateContact ?? '', personalEmail: s.personalEmail ?? '', fatherName: s.fatherName ?? '', motherName: s.motherName ?? '', lastSchool: s.lastSchool ?? '',
    },
  });
}));

router.put('/students/:id', guard(async (req, res) => {
  const p = z.object(contactFields).safeParse(req.body);
  if (!p.success) return fail(res, p.error.issues[0].message);
  const s = await myStudent(req, res);
  if (!s) return;
  const b = p.data;
  await prisma.$transaction([
    prisma.user.update({ where: { id: s.userId }, data: pick(b, ['phone', 'city', 'address']) }),
    prisma.student.update({ where: { id: s.id }, data: pick(b, ['alternateContact', 'personalEmail', 'fatherName', 'motherName', 'lastSchool']) }),
  ]);
  res.json({ saved: true });
}));

export default router;
