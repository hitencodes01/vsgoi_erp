import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { iso, parseDate, today } from '../lib/dates.js';
import { classLabel, yearOf } from '../lib/classes.js';
import { fail, guard, idOf } from '../lib/http.js';
import { currentSession } from '../lib/settings.js';

const router = Router();
router.use(requireAuth);
const admin = requireRole('ADMIN');

const sumPaid = (payments) => payments.reduce((s, p) => s + p.amount, 0);
function statusOf(amount, paid, dueDate) {
  if (paid >= amount) return 'Paid';
  if (dueDate < today()) return 'Overdue';
  return paid > 0 ? 'Partial' : 'Due';
}
const payOut = (p) => ({ id: p.id, amount: p.amount, paidOn: iso(p.paidOn), mode: p.mode, reference: p.reference ?? '' });

// ---------- student: own fees ----------
router.get('/mine', requireRole('STUDENT'), guard(async (req, res) => {
  const student = await prisma.student.findUnique({ where: { userId: req.user.id } });
  const demands = await prisma.feeDemand.findMany({
    where: { studentId: student?.id ?? -1 }, include: { payments: { orderBy: { paidOn: 'asc' } }, session: true }, orderBy: { dueDate: 'asc' },
  });
  const list = demands.map((d) => {
    const paid = sumPaid(d.payments);
    return { id: d.id, title: d.title, session: d.session.name, amount: d.amount, paid, balance: d.amount - paid, dueDate: iso(d.dueDate), status: statusOf(d.amount, paid, d.dueDate), payments: d.payments.map(payOut) };
  });
  const total = list.reduce((s, d) => s + d.amount, 0);
  const paid = list.reduce((s, d) => s + d.paid, 0);
  res.json({ summary: { total, paid, due: total - paid }, demands: list });
}));

// ---------- admin ----------
router.get('/', admin, guard(async (_req, res) => {
  const demands = await prisma.feeDemand.findMany({
    include: { student: { include: { user: { select: { name: true } }, course: true, department: true } }, payments: true, session: true },
    orderBy: [{ dueDate: 'asc' }, { id: 'asc' }], take: 3000,
  });
  const rows = demands.map((d) => {
    const paid = sumPaid(d.payments);
    return {
      id: d.id, enrollmentNo: d.student.enrollmentNo, name: d.student.user.name, course: d.student.course.code, department: d.student.department?.code ?? '',
      semester: d.student.semester, year: yearOf(d.student.semester), section: d.student.section, title: d.title, amount: d.amount, paid, balance: d.amount - paid, dueDate: iso(d.dueDate), status: statusOf(d.amount, paid, d.dueDate),
    };
  });
  res.json({ rows, totals: { amount: rows.reduce((s, r) => s + r.amount, 0), paid: rows.reduce((s, r) => s + r.paid, 0) } });
}));

const demandSchema = z.object({
  title: z.string().trim().min(2, 'Enter a title, like Tuition fee.').max(150, 'The title is too long.'),
  amount: z.number({ invalid_type_error: 'Amount must be a number.' }).int().min(1, 'Amount must be at least 1.').max(10000000, 'Amount is too large.'),
  dueDate: z.string(),
});
const bulkSchema = demandSchema.extend({
  courseId: z.number({ invalid_type_error: 'Choose a course.', required_error: 'Choose a course.' }).int(),
  departmentId: z.number().int().nullable().optional(),
  semester: z.number().int().nullable().optional(),
  section: z.string().nullable().optional(),
});

// Creates the same fee for every active student of the chosen course / department / semester / section.
router.post('/demands', admin, guard(async (req, res) => {
  const p = bulkSchema.safeParse(req.body);
  if (!p.success) return fail(res, p.error.issues[0].message);
  const due = parseDate(p.data.dueDate);
  if (!due) return fail(res, 'Enter a valid due date.');
  const session = await currentSession();
  if (!session) return fail(res, 'Create an academic session first.');
  const b = p.data;
  const students = await prisma.student.findMany({
    where: { status: 'ACTIVE', courseId: b.courseId, ...(b.departmentId ? { departmentId: b.departmentId } : {}), ...(b.semester ? { semester: b.semester } : {}), ...(b.section ? { section: b.section } : {}) },
    select: { id: true },
  });
  if (!students.length) return fail(res, 'No active students match that selection.');
  const r = await prisma.feeDemand.createMany({ data: students.map((s) => ({ studentId: s.id, sessionId: session.id, title: b.title, amount: b.amount, dueDate: due })) });
  res.status(201).json({ created: r.count });
}));

router.get('/demands/:id', admin, guard(async (req, res) => {
  const id = idOf(req);
  const d = id && (await prisma.feeDemand.findUnique({ where: { id }, include: { payments: { orderBy: { paidOn: 'asc' } }, student: { include: { user: { select: { name: true } }, course: true, department: true } } } }));
  if (!d) return fail(res, 'Fee not found.', 404);
  const paid = sumPaid(d.payments);
  res.json({
    item: {
      id: d.id, title: d.title, amount: d.amount, dueDate: iso(d.dueDate), paid, balance: d.amount - paid, status: statusOf(d.amount, paid, d.dueDate),
      student: { id: d.studentId, name: d.student.user.name, enrollmentNo: d.student.enrollmentNo, classLabel: classLabel({ course: d.student.course, department: d.student.department, semester: d.student.semester, section: d.student.section }) },
      payments: d.payments.map(payOut),
    },
  });
}));

router.put('/demands/:id', admin, guard(async (req, res) => {
  const id = idOf(req);
  const p = demandSchema.safeParse(req.body);
  if (!p.success) return fail(res, p.error.issues[0].message);
  const due = parseDate(p.data.dueDate);
  if (!due) return fail(res, 'Enter a valid due date.');
  const d = id && (await prisma.feeDemand.findUnique({ where: { id }, include: { payments: true } }));
  if (!d) return fail(res, 'Fee not found.', 404);
  if (p.data.amount < sumPaid(d.payments)) return fail(res, 'The amount cannot be less than what has already been paid.', 409);
  await prisma.feeDemand.update({ where: { id }, data: { title: p.data.title, amount: p.data.amount, dueDate: due } });
  res.json({ saved: true });
}));

router.delete('/demands/:id', admin, guard(async (req, res) => {
  const id = idOf(req);
  const d = id && (await prisma.feeDemand.findUnique({ where: { id }, include: { _count: { select: { payments: true } } } }));
  if (!d) return fail(res, 'Fee not found.', 404);
  if (d._count.payments) return fail(res, 'Payments were recorded against this fee, so it cannot be deleted.', 409);
  await prisma.feeDemand.delete({ where: { id } });
  res.json({ deleted: true });
}));

const MODES = ['Cash', 'UPI', 'Card', 'Bank transfer', 'Cheque'];
const paymentSchema = z.object({
  amount: z.number({ invalid_type_error: 'Amount must be a number.' }).int().min(1, 'Amount must be at least 1.'),
  paidOn: z.string(),
  mode: z.enum(MODES, { errorMap: () => ({ message: 'Choose how it was paid.' }) }),
  reference: z.string().trim().max(100, 'Reference is too long.').optional(),
});

router.post('/demands/:id/payments', admin, guard(async (req, res) => {
  const id = idOf(req);
  const p = paymentSchema.safeParse(req.body);
  if (!p.success) return fail(res, p.error.issues[0].message);
  const paidOn = parseDate(p.data.paidOn);
  if (!paidOn || paidOn > today()) return fail(res, 'Enter a valid payment date (not in the future).');
  const d = id && (await prisma.feeDemand.findUnique({ where: { id }, include: { payments: true } }));
  if (!d) return fail(res, 'Fee not found.', 404);
  const balance = d.amount - sumPaid(d.payments);
  if (p.data.amount > balance) return fail(res, `Only ${balance} is left to pay.`, 409);
  await prisma.payment.create({ data: { demandId: id, amount: p.data.amount, paidOn, mode: p.data.mode, reference: p.data.reference || null, recordedById: req.user.id } });
  res.status(201).json({ saved: true });
}));

router.delete('/payments/:id', admin, guard(async (req, res) => {
  const id = idOf(req);
  if (!id || !(await prisma.payment.findUnique({ where: { id }, select: { id: true } }))) return fail(res, 'Payment not found.', 404);
  await prisma.payment.delete({ where: { id } });
  res.json({ deleted: true });
}));

export { MODES };
export default router;
