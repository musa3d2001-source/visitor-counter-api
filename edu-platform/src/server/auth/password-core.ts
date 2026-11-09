import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

/**
 * (نواة بدون server-only لاستخدامها في السكربتات أيضًا)
 * تجزئة كلمات المرور باستخدام scrypt المدمج في Node.js (بدون مكتبات أصلية).
 * المعاملات وفق توصيات OWASP: N=2^15, r=8, p=3 (≈32MiB ذاكرة).
 * الصيغة المخزنة: scrypt$N$r$p$salt(base64)$hash(base64)
 */
export function loginFailurePrefix(email: string) {
  return `login:fail:${email.toLowerCase()}|`;
}

const N = 2 ** 15;
const R = 8;
const P = 3;
const KEYLEN = 64;
const MAXMEM = 128 * N * R * 2;

function scrypt(password: string, salt: Buffer, keylen: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password.normalize("NFKC"), salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nStr, rStr, pStr, saltB64, hashB64] = parts;
  const n = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length, {
    N: n,
    r,
    p,
    maxmem: 128 * n * r * 2,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** تجزئة وهمية بنفس الكلفة لتوحيد زمن الاستجابة عند عدم وجود المستخدم */
let dummyHash: string | null = null;
export async function burnPasswordTime(password: string) {
  if (!dummyHash) dummyHash = await hashPassword("dummy-password-for-timing");
  await verifyPassword(password, dummyHash);
}
