import { prisma } from './prisma.js';

const DEFAULTS = { attendanceThreshold: 75, passPercent: 40 };

export async function getSettings() {
  const rows = await prisma.setting.findMany();
  const out = { ...DEFAULTS };
  for (const r of rows) if (r.key in out && Number.isFinite(Number(r.value))) out[r.key] = Number(r.value);
  return out;
}

export const currentSession = () => prisma.session.findFirst({ where: { isCurrent: true } });
