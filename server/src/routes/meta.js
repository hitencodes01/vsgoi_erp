import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { SECTIONS } from '../lib/classes.js';
import { currentSession, getSettings } from '../lib/settings.js';

const router = Router();
router.use(requireAuth);

// Course > department structure and settings used by forms and filters on every screen.
router.get('/', async (req, res) => {
  const [courses, session, settings] = await Promise.all([
    prisma.course.findMany({ include: { departments: { orderBy: { code: 'asc' } } }, orderBy: { code: 'asc' } }),
    currentSession(),
    getSettings(),
  ]);
  const out = {
    session: session ? { id: session.id, name: session.name } : null,
    sections: SECTIONS,
    settings,
    courses: courses.map((c) => ({
      id: c.id, code: c.code, name: c.name, semesters: c.semesters,
      departments: c.departments.map((d) => ({ id: d.id, code: d.code, name: d.name, semesters: d.semesters ?? c.semesters })),
    })),
  };
  if (req.user.role === 'ADMIN') {
    const [teachers, sessions] = await Promise.all([
      prisma.teacher.findMany({ include: { user: { select: { name: true, active: true } } }, orderBy: { employeeCode: 'asc' } }),
      prisma.session.findMany({ orderBy: { name: 'desc' } }),
    ]);
    out.teachers = teachers.map((t) => ({ id: t.id, name: t.user.name, employeeCode: t.employeeCode, active: t.user.active }));
    out.sessions = sessions.map((s) => ({ id: s.id, name: s.name, isCurrent: s.isCurrent }));
  }
  res.json(out);
});

export default router;
