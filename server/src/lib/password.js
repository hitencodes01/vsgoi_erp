import { randomInt } from 'node:crypto';
import { z } from 'zod';

export const passwordSchema = z
  .string({ required_error: 'Enter a new password.' })
  .min(8, 'Password must be at least 8 characters.')
  .max(72, 'Password can be at most 72 characters.')
  .regex(/[A-Za-z]/, 'Password needs at least one letter and one number.')
  .regex(/\d/, 'Password needs at least one letter and one number.');

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
const DIGITS = '23456789';

// 10 characters, always with a letter and a digit, no look-alike characters (0/O, 1/l/I).
export function tempPassword() {
  const pick = (set) => set[randomInt(set.length)];
  const chars = [pick(LETTERS), pick(DIGITS)];
  while (chars.length < 10) chars.push(pick(LETTERS + DIGITS));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
