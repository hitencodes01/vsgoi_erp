import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { DOMAIN, facultyLocal, lastTwoDigits, studentLocal } from '../src/lib/emails.js';

const prisma = new PrismaClient();

// Deterministic pseudo-random numbers so every seed run looks the same.
let state = 42;
const rnd = () => {
  state = (state * 1664525 + 1013904223) % 4294967296;
  return state / 4294967296;
};
const utc = (d) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
const pad = (n) => String(n).padStart(2, '0');

const COURSES = [
  { code: 'BTECH', name: 'B.Tech', semesters: 8, departments: [['CSE', 'Computer Science & Engineering'], ['CS', 'Computer Science'], ['ME', 'Mechanical Engineering'], ['EE', 'Electrical Engineering']] },
  { code: 'BBA', name: 'BBA', semesters: 6, departments: [] },
  { code: 'BCA', name: 'BCA', semesters: 6, departments: [] },
  { code: 'MBA', name: 'MBA', semesters: 4, departments: [] },
  { code: 'DIPLOMA', name: 'Diploma', semesters: 6, departments: [['EE', 'Electrical Engineering'], ['ME', 'Mechanical Engineering'], ['CE', 'Civil Engineering']] },
  { code: 'ITI', name: 'ITI', semesters: 4, departments: [['FITTER', 'Fitter'], ['WELDER', 'Welder'], ['ELECTRICIAN', 'Electrician']] },
];

// Demo classes: course, department (or null), semester, sections, subjects.
const CLASSES = [
  { course: 'BTECH', dept: 'CSE', sem: 3, sections: ['A', 'B'], subjects: [['CSE301', 'Data Structures'], ['CSE302', 'Database Systems'], ['CSE303', 'Operating Systems']] },
  { course: 'BTECH', dept: 'ME', sem: 3, sections: ['A'], subjects: [['ME301', 'Thermodynamics'], ['ME302', 'Fluid Mechanics'], ['ME303', 'Machine Design']] },
  { course: 'BCA', dept: null, sem: 1, sections: ['A', 'B'], subjects: [['BCA101', 'Programming in C'], ['BCA102', 'Computer Fundamentals'], ['BCA103', 'Mathematics']] },
  { course: 'BBA', dept: null, sem: 1, sections: ['A'], subjects: [['BBA101', 'Principles of Management'], ['BBA102', 'Business Economics'], ['BBA103', 'Accounting Basics']] },
  { course: 'MBA', dept: null, sem: 1, sections: ['A'], subjects: [['MBA101', 'Managerial Economics'], ['MBA102', 'Organizational Behaviour'], ['MBA103', 'Marketing Management']] },
  { course: 'DIPLOMA', dept: 'CE', sem: 1, sections: ['A'], subjects: [['DCE101', 'Engineering Drawing'], ['DCE102', 'Surveying Basics'], ['DCE103', 'Building Materials']] },
  { course: 'ITI', dept: 'FITTER', sem: 1, sections: ['A'], subjects: [['ITF101', 'Workshop Calculation'], ['ITF102', 'Trade Theory'], ['ITF103', 'Engineering Drawing']] },
];

const FACULTY = ['Dr. Anita Sharma', 'Prof. Rohan Verma', 'Dr. Meera Iyer', 'Prof. Arjun Singh', 'Dr. Kavita Rao', 'Prof. Sanjay Gupta', 'Dr. Neha Kapoor', 'Prof. Vikram Joshi'];
const QUALITY = [0.94, 0.88, 0.82, 0.76, 0.9, 0.7, 0.85, 0.8];
const FIRST = ['Aarav', 'Diya', 'Vihaan', 'Ananya', 'Reyansh', 'Ishita', 'Kabir', 'Saanvi', 'Arnav', 'Myra', 'Dev', 'Tara', 'Krish', 'Riya', 'Aditya', 'Kiara', 'Rohan', 'Pooja', 'Yash', 'Neha', 'Harsh', 'Sneha', 'Manav', 'Isha'];
const LAST = ['Mishra', 'Patel', 'Yadav', 'Khan', 'Joshi', 'Dubey', 'Tiwari', 'Nair', 'Das', 'Chauhan', 'Pandey', 'Saxena'];
const TUITION = { BTECH: 60000, BBA: 35000, BCA: 35000, MBA: 80000, DIPLOMA: 30000, ITI: 15000 };

async function main() {
  const adminHash = await bcrypt.hash('Admin@12345', 10);
  const facultyHash = await bcrypt.hash('Faculty@123', 10);
  const studentHash = await bcrypt.hash('Student@123', 10);

  const admin = await prisma.user.upsert({
    where: { email: `admin@${DOMAIN}` }, update: {}, create: { email: `admin@${DOMAIN}`, name: 'Administrator', role: 'ADMIN', passwordHash: adminHash },
  });

  if ((await prisma.course.count()) > 0) {
    console.log('Demo data already exists, nothing to add.');
    return;
  }

  await prisma.setting.createMany({ data: [{ key: 'attendanceThreshold', value: '75' }, { key: 'passPercent', value: '40' }] });
  const session = await prisma.session.create({ data: { name: '2026-27', isCurrent: true } });

  // courses and departments
  const courses = {};
  for (const c of COURSES) {
    const course = await prisma.course.create({ data: { code: c.code, name: c.name, semesters: c.semesters } });
    courses[c.code] = { ...course, departments: {} };
    for (const [code, name] of c.departments) courses[c.code].departments[code] = await prisma.department.create({ data: { courseId: course.id, code, name } });
  }

  // faculty
  const usedEmails = new Set([`admin@${DOMAIN}`]);
  const unique = (local) => {
    let n = 1;
    let email = `${local}@${DOMAIN}`;
    while (usedEmails.has(email)) email = `${local}${++n}@${DOMAIN}`;
    usedEmails.add(email);
    return email;
  };
  const teachers = [];
  for (let i = 0; i < FACULTY.length; i++) {
    const user = await prisma.user.create({
      data: { email: unique(facultyLocal(FACULTY[i])), name: FACULTY[i], role: 'TEACHER', passwordHash: facultyHash, phone: `98765${pad(i)}000`, teacher: { create: { employeeCode: `T${String(i + 1).padStart(3, '0')}` } } },
      include: { teacher: true },
    });
    teachers.push({ id: user.teacher.id, email: user.email, quality: QUALITY[i] });
  }

  // students, subjects, assignments
  let studentNo = 0;
  let sampleStudent = '';
  let assignIdx = 0;
  const assignInfo = new Map(); // assignmentId -> { students, quality }
  const allStudents = [];

  for (const cls of CLASSES) {
    const course = courses[cls.course];
    const dept = cls.dept ? course.departments[cls.dept] : null;

    const subjects = [];
    for (const [code, name] of cls.subjects) {
      subjects.push(await prisma.subject.create({ data: { code, name, credits: 4, courseId: course.id, departmentId: dept?.id ?? null, semester: cls.sem } }));
    }

    for (const section of cls.sections) {
      const students = [];
      for (let k = 0; k < 8; k++) {
        studentNo++;
        const name = `${FIRST[(studentNo * 7) % FIRST.length]} ${LAST[(studentNo * 5) % LAST.length]}`;
        const enrollmentNo = `VSGOI26${String(studentNo).padStart(4, '0')}`;
        const email = unique(studentLocal(name, cls.course, lastTwoDigits('', enrollmentNo)));
        const user = await prisma.user.create({
          data: {
            email, name, role: 'STUDENT', passwordHash: studentHash, phone: `90000${String(studentNo).padStart(5, '0')}`, city: 'Kanpur',
            student: { create: { enrollmentNo, courseId: course.id, departmentId: dept?.id ?? null, semester: cls.sem, section, fatherName: `Father of ${name.split(' ')[0]}`, motherName: `Mother of ${name.split(' ')[0]}`, lastSchool: 'Demo Senior Secondary School' } },
          },
          include: { student: true },
        });
        if (!sampleStudent) sampleStudent = email;
        const s = { id: user.student.id, propensity: 0.65 + rnd() * 0.33 };
        students.push(s);
        allStudents.push({ ...s, course: cls.course });
      }
      for (const subject of subjects) {
        const teacher = teachers[assignIdx % teachers.length];
        const a = await prisma.assignment.create({ data: { subjectId: subject.id, teacherId: teacher.id, sessionId: session.id, section } });
        assignInfo.set(a.id, { students, quality: teacher.quality, idx: assignIdx });
        assignIdx++;
      }
    }
  }

  // lectures: two weekdays a week, six weeks back and one week ahead
  const base = utc(new Date());
  const lectureRows = [];
  for (const [assignmentId, info] of assignInfo) {
    const i = info.idx;
    const days = [(i % 5) + 1, ((i + 2) % 5) + 1];
    const hour = 9 + (i % 6);
    for (let off = -42; off <= 7; off++) {
      const date = addDays(base, off);
      if (days.includes(date.getUTCDay())) {
        lectureRows.push({ assignmentId, date, startTime: `${pad(hour)}:00`, endTime: `${pad(hour + 1)}:00`, room: `Room ${101 + (i % 12)}` });
      }
    }
  }
  await prisma.lecture.createMany({ data: lectureRows });

  // attendance for lectures before today (today and later stay open for marking)
  const past = await prisma.lecture.findMany({ where: { date: { lt: base } }, select: { id: true, assignmentId: true, date: true } });
  const attendance = [];
  for (const l of past) {
    const info = assignInfo.get(l.assignmentId);
    for (const s of info.students) {
      const p = s.propensity * 0.55 + info.quality * 0.45;
      const r = rnd();
      const status = r < p ? (rnd() < 0.08 ? 'LATE' : 'PRESENT') : rnd() < 0.1 ? 'EXCUSED' : 'ABSENT';
      attendance.push({ lectureId: l.id, studentId: s.id, assignmentId: l.assignmentId, date: l.date, status });
    }
  }
  for (let i = 0; i < attendance.length; i += 1000) await prisma.attendance.createMany({ data: attendance.slice(i, i + 1000), skipDuplicates: true });

  // one exam per assignment with marks for everyone
  const marks = [];
  for (const [assignmentId, info] of assignInfo) {
    const exam = await prisma.exam.create({ data: { assignmentId, name: 'Mid Sem 1', maxMarks: 30, date: addDays(base, -10) } });
    for (const s of info.students) {
      const pct = Math.min(0.98, Math.max(0.25, 0.4 + s.propensity * 0.5 + (rnd() - 0.5) * 0.2));
      marks.push({ examId: exam.id, studentId: s.id, score: Math.round(30 * pct) });
    }
  }
  await prisma.mark.createMany({ data: marks });

  // fees: a tuition installment and an exam fee for every student
  const students = await prisma.student.findMany({ include: { course: true } });
  for (const s of students) {
    const tuition = Math.round(TUITION[s.course.code] / 2);
    const r = rnd();
    const payments = r < 0.55 ? [{ amount: tuition, paidOn: addDays(base, -15), mode: 'UPI', reference: `UPI${100000 + s.id}` }] : r < 0.8 ? [{ amount: Math.round(tuition / 2), paidOn: addDays(base, -12), mode: 'Cash' }] : [];
    await prisma.feeDemand.create({ data: { studentId: s.id, sessionId: session.id, title: 'Tuition fee 2026-27 (installment 1)', amount: tuition, dueDate: addDays(base, r < 0.8 ? 20 : -5), payments: { create: payments } } });
    await prisma.feeDemand.create({
      data: { studentId: s.id, sessionId: session.id, title: 'Examination fee', amount: 1500, dueDate: addDays(base, -10), payments: { create: rnd() < 0.7 ? [{ amount: 1500, paidOn: addDays(base, -11), mode: 'Cash' }] : [] } },
    });
  }

  await prisma.notice.createMany({
    data: [
      { title: 'Welcome to session 2026-27', body: 'Classes for the new session are running. Check your timetable and attendance from your dashboard.', audience: 'ALL', createdById: admin.id },
      { title: 'Minimum attendance is 75%', body: 'Students below 75% attendance in any subject may not be allowed in the end-semester exam. Keep an eye on your dashboard.', audience: 'STUDENT', createdById: admin.id },
      { title: 'Faculty: mark attendance the same day', body: 'Please mark attendance for each lecture on the same day so that dashboards stay accurate.', audience: 'TEACHER', createdById: admin.id },
    ],
  });

  console.log(`Seeded ${studentNo} students, ${teachers.length} faculty, ${assignInfo.size} subject assignments, ${lectureRows.length} lectures, ${attendance.length} attendance records.`);
  console.log(`Logins: admin@${DOMAIN} / Admin@12345, ${teachers[0].email} / Faculty@123, ${sampleStudent} / Student@123`);
}

main().finally(() => prisma.$disconnect());
