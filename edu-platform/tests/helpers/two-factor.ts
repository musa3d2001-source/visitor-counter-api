import { beginTwoFactorEnrolment, confirmTwoFactorEnrolment } from "@/server/auth/two-factor";
import { createSession, hashToken } from "@/server/auth/session";
import { base32Decode, hotp, timeStep } from "@/server/auth/two-factor-core";
import { sql } from "./db";

export const currentStep = () => timeStep(Date.now());
export const codeAt = (secret: Buffer, step: number) => hotp(secret, step);

/** رمز لا يطابق أي خطوة في النافذة الحالية */
export function wrongCode(secret: Buffer): string {
  const step = currentStep();
  const valid = new Set([step - 1, step, step + 1].map((s) => codeAt(secret, s)));
  for (let n = 0; ; n++) {
    const candidate = String(n).padStart(6, "0");
    if (!valid.has(candidate)) return candidate;
  }
}

/** يسجّل مديرًا فعليًا عبر المسار الحقيقي، ويعيد الجلسة والسر والرموز */
export async function enrolAdmin(user: { id: string; email: string }) {
  const session = await createSession(user.id, { ip: "192.0.2.10", userAgent: "vitest" });
  const sessionId = hashToken(session.token);
  const details = await beginTwoFactorEnrolment({ userId: user.id, sessionId, account: user.email, issuer: "فرقد" });
  if (!details) throw new Error("already enrolled");
  const secret = base32Decode(details.manualKey.replace(/\s/g, ""));
  const confirmed = await confirmTwoFactorEnrolment({ userId: user.id, sessionId, code: codeAt(secret, currentStep()), ip: "192.0.2.10" });
  if (!confirmed.ok) throw new Error(`enrolment refused: ${confirmed.error}`);
  return { session, sessionId, secret, recoveryCodes: confirmed.recoveryCodes, details };
}

/** رمز جديد في اختبار لا يدور حول منع التكرار: يفتح حارس آخر خطوة مقبولة ويعيد رمز الخطوة الحالية */
export async function freshCode(userId: string, secret: Buffer): Promise<string> {
  await sql`update user_totp set last_used_step = null where user_id = ${userId}`;
  return codeAt(secret, currentStep());
}
