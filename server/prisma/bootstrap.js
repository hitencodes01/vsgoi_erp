// Production setup: creates the admin account, the six courses with their departments, the current
// session and the default rules. No demo people or data. Safe to run again (it skips what exists).
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { DOMAIN } from '../src/lib/emails.js';
import { tempPassword } from '../src/lib/password.js';

const prisma = new PrismaClient();

const COURSES = [
  { code: 'BTECH', name: 'B.Tech', semesters: 8, departments: [['CSE', 'Computer Science & Engineering'], ['CS', 'Computer Science'], ['ME', 'Mechanical Engineering'], ['EE', 'Electrical Engineering']] },
  { code: 'BBA', name: 'BBA', semesters: 6, departments: [] },
  { code: 'BCA', name: 'BCA', semesters: 6, departments: [] },
  { code: 'MBA', name: 'MBA', semesters: 4, departments: [] },
  { code: 'DIPLOMA', name: 'Diploma', semesters: 6, departments: [['EE', 'Electrical Engineering'], ['ME', 'Mechanical Engineering'], ['CE', 'Civil Engineering']] },
  { code: 'ITI', name: 'ITI', semesters: 4, departments: [['FITTER', 'Fitter'], ['WELDER', 'Welder'], ['ELECTRICIAN', 'Electrician']] },
];

async function main() {
  const email = `admin@${DOMAIN}`;
  if (!(await prisma.user.findUnique({ where: { email } }))) {
    const password = tempPassword();
    await prisma.user.create({ data: { email, name: 'Administrator', role: 'ADMIN', passwordHash: await bcrypt.hash(password, 10), mustChangePassword: true } });
    console.log(`\nAdmin created.\n  Email:    ${email}\n  Password: ${password}\n(Shown once. You must choose a new password at first sign-in.)\n`);
  } else {
    console.log('Admin already exists.');
  }

  for (const c of COURSES) {
    const course = (await prisma.course.findUnique({ where: { code: c.code } })) ?? (await prisma.course.create({ data: { code: c.code, name: c.name, semesters: c.semesters } }));
    for (const [code, name] of c.departments) {
      await prisma.department.upsert({ where: { courseId_code: { courseId: course.id, code } }, update: {}, create: { courseId: course.id, code, name } });
    }
  }

  if ((await prisma.session.count()) === 0) {
    const now = new Date();
    const start = now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1; // sessions start in June
    await prisma.session.create({ data: { name: `${start}-${String((start + 1) % 100).padStart(2, '0')}`, isCurrent: true } });
  }
  for (const [key, value] of [['attendanceThreshold', '75'], ['passPercent', '40']]) {
    await prisma.setting.upsert({ where: { key }, update: {}, create: { key, value } });
  }
  console.log('Courses, departments, session and rules are ready.');
}

main().finally(() => prisma.$disconnect());
