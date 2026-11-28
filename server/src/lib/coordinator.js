import { prisma } from './prisma.js';
import { currentSession } from './settings.js';

// Classes (course + department + semester + section) that this signed-in faculty member coordinates in the current session.
export async function coordinatedClasses(userId) {
  const [session, teacher] = await Promise.all([currentSession(), prisma.teacher.findUnique({ where: { userId }, select: { id: true } })]);
  if (!session || !teacher) return [];
  return prisma.coordinator.findMany({
    where: { teacherId: teacher.id, sessionId: session.id },
    include: { course: true, department: true },
    orderBy: [{ courseId: 'asc' }, { departmentId: 'asc' }, { semester: 'asc' }, { section: 'asc' }],
  });
}

export const isCoordinator = async (user) => user.role === 'TEACHER' && (await coordinatedClasses(user.id)).length > 0;
