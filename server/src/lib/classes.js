import { prisma } from './prisma.js';

export const SECTIONS = ['A', 'B', 'C'];
export const yearOf = (semester) => Math.ceil(semester / 2);

// A "class" = course + optional department + semester (+ section for a student group).
export const classLabel = ({ course, department, semester, section }) =>
  `${course.code}${department ? ` ${department.code}` : ''} · Sem ${semester}${section ? ` · Sec ${section}` : ''}`;

export const maxSemester = (course, department) => department?.semesters ?? course.semesters;

// The one rule that separates courses: if a course has departments, a department is required; otherwise none is allowed.
export async function resolveClass({ courseId, departmentId, semester }) {
  const course = courseId ? await prisma.course.findUnique({ where: { id: courseId }, include: { departments: true } }) : null;
  if (!course) return { error: 'Choose a valid course.' };
  let department = null;
  if (course.departments.length) {
    department = course.departments.find((d) => d.id === departmentId) ?? null;
    if (!department) return { error: `Choose a department for ${course.code}.` };
  } else if (departmentId) {
    return { error: `${course.code} has no departments.` };
  }
  const max = maxSemester(course, department);
  if (!Number.isInteger(semester) || semester < 1 || semester > max) {
    return { error: `Semester must be 1 to ${max} for ${department?.code ?? course.code}.` };
  }
  return { course, department, max };
}

// Students who attend a subject's lectures for one section.
export const studentWhere = (subject, section) => ({
  courseId: subject.courseId,
  departmentId: subject.departmentId ?? null,
  semester: subject.semester,
  status: 'ACTIVE',
  ...(section ? { section } : {}),
});
