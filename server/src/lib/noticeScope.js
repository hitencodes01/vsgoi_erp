// Which notices a role may see. Admins see everything.
export const noticeWhere = (role, courseId) => {
  if (role === 'ADMIN') return {};
  if (role === 'STUDENT') return { audience: { in: ['ALL', 'STUDENT'] }, OR: [{ courseId: null }, { courseId }] };
  return { audience: { in: ['ALL', 'TEACHER'] }, courseId: null };
};
