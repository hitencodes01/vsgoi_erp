import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { iso } from '../lib/dates.js';
import { fail, guard, idOf } from '../lib/http.js';
import { noticeWhere } from '../lib/noticeScope.js';

const router = Router();
router.use(requireAuth);
const admin = requireRole('ADMIN');

const AUDIENCE = { ALL: 'Everyone', STUDENT: 'Students', TEACHER: 'Faculty' };

router.get('/', guard(async (req, res) => {
  let courseId = null;
  if (req.user.role === 'STUDENT') courseId = (await prisma.student.findUnique({ where: { userId: req.user.id }, select: { courseId: true } }))?.courseId ?? null;
  const list = await prisma.notice.findMany({
    where: noticeWhere(req.user.role, courseId), include: { course: true, createdBy: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 200,
  });
  res.json({
    notices: list.map((n) => ({ id: n.id, title: n.title, body: n.body, audience: AUDIENCE[n.audience] ?? n.audience, course: n.course?.code ?? '', date: iso(n.createdAt), by: n.createdBy.name })),
  });
}));

const schema = z.object({
  title: z.string().trim().min(3, 'Enter a title.').max(150, 'The title is too long.'),
  body: z.string().trim().min(3, 'Write the notice.').max(5000, 'The notice is too long.'),
  audience: z.enum(['ALL', 'STUDENT', 'TEACHER'], { errorMap: () => ({ message: 'Choose who should see it.' }) }),
  courseId: z.number().int().nullable().optional(),
});

async function input(req, res) {
  const p = schema.safeParse(req.body);
  if (!p.success) return void fail(res, p.error.issues[0].message);
  const b = p.data;
  if (b.courseId) {
    if (b.audience === 'TEACHER') return void fail(res, 'A course can only be chosen for notices to students or everyone.');
    if (!(await prisma.course.findUnique({ where: { id: b.courseId }, select: { id: true } }))) return void fail(res, 'Choose a valid course.');
  }
  return { ...b, courseId: b.courseId ?? null };
}

router.post('/', admin, guard(async (req, res) => {
  const b = await input(req, res);
  if (!b) return;
  res.status(201).json({ id: (await prisma.notice.create({ data: { ...b, createdById: req.user.id } })).id });
}));

router.get('/:id', admin, guard(async (req, res) => {
  const id = idOf(req);
  const n = id && (await prisma.notice.findUnique({ where: { id } }));
  if (!n) return fail(res, 'Notice not found.', 404);
  res.json({ item: { id: n.id, title: n.title, body: n.body, audience: n.audience, courseId: n.courseId ?? '' } });
}));

router.put('/:id', admin, guard(async (req, res) => {
  const id = idOf(req);
  const b = await input(req, res);
  if (!b) return;
  if (!id || !(await prisma.notice.findUnique({ where: { id }, select: { id: true } }))) return fail(res, 'Notice not found.', 404);
  await prisma.notice.update({ where: { id }, data: b });
  res.json({ saved: true });
}));

router.delete('/:id', admin, guard(async (req, res) => {
  const id = idOf(req);
  if (!id || !(await prisma.notice.findUnique({ where: { id }, select: { id: true } }))) return fail(res, 'Notice not found.', 404);
  await prisma.notice.delete({ where: { id } });
  res.json({ deleted: true });
}));

export default router;
