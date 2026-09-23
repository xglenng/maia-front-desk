import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const token = () => randomBytes(32).toString('hex');
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function verifyPassword(password: string, encoded: string) {
  const [salt, hash] = encoded.split(':');
  const expected = Buffer.from(hash || '', 'hex');
  const actual = scryptSync(password, salt || 'invalid', 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
