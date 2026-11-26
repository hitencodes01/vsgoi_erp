import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { signToken } from '../lib/token.js';
import { passwordSchema } from '../lib/password.js';
import { iso, parseDate, today } from '../lib/dates.js';

const router = Router();
router.use(requireAuth);

async function profileOf(userId) {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    include: { student: { include: { course: true, department: true } }, teacher: true },
  });
  return {
    name: u.name,
    email: u.email,
    role: u.role,
    memberSince: iso(u.createdAt),
    enrollmentNo: u.student?.enrollmentNo ?? '',
    course: u.student?.course.name ?? '',
    department: u.student?.department?.name ?? '',
    semester: u.student?.semester ?? '',
    section: u.student?.section ?? '',
    employeeCode: u.teacher?.employeeCode ?? '',
    phone: u.phone ?? '',
    address: u.address ?? '',
    city: u.city ?? '',
    dateOfBirth: u.dateOfBirth ? iso(u.dateOfBirth) : '',
    emergencyContactName: u.emergencyContactName ?? '',
    emergencyContactPhone: u.emergencyContactPhone ?? '',
    bio: u.bio ?? '',
  };
}

router.get('/', async (req, res) => {
  res.json({ profile: await profileOf(req.user.id) });
});

const phone = z.string().trim().regex(/^\+?[\d\s-]{7,20}$/, 'Enter a valid phone number.');
const profileSchema = z
  .object({
    phone: z.union([phone, z.literal('')]),
    address: z.string().trim().max(255, 'Address is too long.'),
    city: z.string().trim().max(80, 'City is too long.'),
    dateOfBirth: z.string(),
    emergencyContactName: z.string().trim().max(100, 'Emergency contact name is too long.'),
    emergencyContactPhone: z.union([phone, z.literal('')]),
    bio: z.string().trim().max(500, 'About you can be at most 500 characters.'),
  })
  .partial()
  .strict();

// Name and email are managed by an administrator, so only these personal details can be changed here.
router.put('/', async (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const data = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    if (key === 'dateOfBirth') {
      if (value === '') {
        data.dateOfBirth = null;
      } else {
        const d = parseDate(value);
        if (!d || d > today() || d.getUTCFullYear() < 1900) return res.status(400).json({ error: 'Enter a valid date of birth.' });
        data.dateOfBirth = d;
      }
    } else {
      data[key] = value === '' ? null : value;
    }
  }
  await prisma.user.update({ where: { id: req.user.id }, data });
  res.json({ profile: await profileOf(req.user.id) });
});

const passwordBody = z.object({
  currentPassword: z.string().min(1, 'Enter your current password.'),
  newPassword: passwordSchema,
});

router.post('/password', async (req, res) => {
  const parsed = passwordBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { currentPassword, newPassword } = parsed.data;

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  // 400, not 401: a wrong current password must not look like an expired session.
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    return res.status(400).json({ error: 'Your current password is incorrect.' });
  }
  if (currentPassword === newPassword) return res.status(400).json({ error: 'Choose a password you have not used just now.' });

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(newPassword, 10), tokenVersion: { increment: 1 }, mustChangePassword: false },
  });
  // Other devices are signed out; this one gets a fresh token so the session continues.
  res.json({ token: signToken(updated), message: 'Password changed. Other devices have been signed out.' });
});

export default router;
