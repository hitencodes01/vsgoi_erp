import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { signToken } from '../lib/token.js';
import { passwordSchema } from '../lib/password.js';
import { sendMail } from '../lib/mailer.js';
import { isCoordinator } from '../lib/coordinator.js';

const router = Router();

const OTP_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
const BAD_CODE = 'That code is incorrect or has expired. Request a new one.';

// Limits are per IP + email, so one busy campus network does not lock everyone out.
const limiter = (limit) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => `${req.ip}|${String(req.body?.email || '').toLowerCase()}`,
    message: { error: 'Too many attempts. Wait a few minutes and try again.' },
  });

const hashOtp = (userId, otp) => createHmac('sha256', process.env.JWT_SECRET).update(`${userId}:${otp}`).digest('hex');
const sameHash = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

router.post('/login', limiter(20), async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter a valid email and password.' });

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  const ok = user && user.active && (await bcrypt.compare(parsed.data.password, user.passwordHash));
  if (!ok) return res.status(401).json({ error: 'Email or password is incorrect.' });

  res.json({ token: signToken(user), user: { id: user.id, name: user.name, email: user.email, role: user.role, mustChangePassword: user.mustChangePassword, isCoordinator: await isCoordinator(user) } });
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { id: true, name: true, email: true, role: true, mustChangePassword: true },
  });
  res.json({ user: { ...user, isCoordinator: await isCoordinator(user) } });
});

// Step 1 of "forgot password": email a 6-digit code. The reply is the same whether or not the email exists.
router.post('/forgot', limiter(5), async (req, res) => {
  const parsed = z.object({ email: z.string().email() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter a valid email address.' });

  const generic = { message: 'If that email is registered, a 6-digit code has been sent. It expires in 10 minutes.' };
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  if (!user || !user.active) return res.json(generic);

  const recent = await prisma.passwordReset.findFirst({
    where: { userId: user.id, createdAt: { gt: new Date(Date.now() - RESEND_COOLDOWN_MS) } },
  });
  if (recent) return res.json(generic);

  const otp = String(randomInt(100000, 1000000));
  await prisma.$transaction([
    prisma.passwordReset.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }),
    prisma.passwordReset.create({
      data: { userId: user.id, otpHash: hashOtp(user.id, otp), expiresAt: new Date(Date.now() + OTP_TTL_MS) },
    }),
  ]);

  const app = process.env.APP_NAME || 'College ERP';
  try {
    await sendMail({
      to: user.email,
      subject: `${app} password reset code`,
      text: `Hello ${user.name},\n\nYour ${app} password reset code is ${otp}.\nIt expires in 10 minutes and works once.\n\nIf you did not ask for this, ignore this email. Your password has not changed.`,
    });
  } catch (err) {
    console.error('Could not send the reset email:', err.message);
  }
  res.json(generic);
});

// Step 2: check the code and set the new password in one request.
const resetSchema = z.object({
  email: z.string().email(),
  otp: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code from your email.'),
  newPassword: passwordSchema,
});

router.post('/reset', limiter(10), async (req, res) => {
  const parsed = resetSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { email, otp, newPassword } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || !user.active) return res.status(400).json({ error: BAD_CODE });

  const reset = await prisma.passwordReset.findFirst({
    where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!reset || reset.attempts >= MAX_ATTEMPTS) return res.status(400).json({ error: BAD_CODE });

  if (!sameHash(reset.otpHash, hashOtp(user.id, otp))) {
    await prisma.passwordReset.update({ where: { id: reset.id }, data: { attempts: { increment: 1 } } });
    return res.status(400).json({ error: BAD_CODE });
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(newPassword, 10), tokenVersion: { increment: 1 }, mustChangePassword: false },
    }),
    prisma.passwordReset.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }),
  ]);
  res.json({ message: 'Password updated. Sign in with your new password.' });
});

export default router;
