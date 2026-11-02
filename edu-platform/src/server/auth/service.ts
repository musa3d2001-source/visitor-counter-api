import "server-only";
import { sql } from "../db";
import { env } from "../env";
import { hashPassword, verifyPassword, burnPasswordTime } from "./password";
import { createSession, generateToken, hashToken, invalidateAllUserSessions } from "./session";
import { hitRateLimit, clearRateLimit, peekRateLimit } from "./rate-limit";
import { sendMail } from "../platform/mailer";
import { getSettings } from "../platform/settings";

/** منطق المصادقة (بدون اعتماد على سياق الطلب لسهولة الاختبار) */

export type AuthResult = { ok: true; userId: string; token: string; expiresAt: Date } | { ok: false; error: string; retryAfter?: number };

/**
 * حدود الدخول:
 *  - لكل حساب: 5 محاولات خلال 15 دقيقة (تُصفّر عند النجاح)
 *  - لكل IP: 50 محاولة **فاشلة** خلال 15 دقيقة — الدخول الناجح لا يُحتسب،
 *    حتى لا يُقفل فصل دراسي كامل يدخل من شبكة مدرسة واحدة (NAT)
 */
const LOGIN_LIMIT = { perAccount: 5, failedPerIp: 50, windowSec: 15 * 60 };

export async function loginWithPassword(email: string, password: string, meta: { ip: string; userAgent: string }): Promise<AuthResult> {
  const accountKey = `login:acct:${email.toLowerCase()}`;
  const ipKey = `login:ipfail:${meta.ip}`;
  const ipState = await peekRateLimit(ipKey, LOGIN_LIMIT.failedPerIp);
  if (ipState.blocked) return { ok: false, error: "محاولات كثيرة. حاول مرة أخرى بعد قليل.", retryAfter: ipState.retryAfterSeconds };
  const failIp = () => hitRateLimit(ipKey, LOGIN_LIMIT.failedPerIp, LOGIN_LIMIT.windowSec);

  const [user] = await sql<{ id: string; password_hash: string; is_active: boolean }[]>`
    select id, password_hash, is_active from users where email = ${email}
  `;
  // نتحقق من حد الحساب قبل فحص كلمة المرور لمنع التخمين
  const acct = await hitRateLimit(accountKey, LOGIN_LIMIT.perAccount, LOGIN_LIMIT.windowSec);
  if (!acct.allowed) {
    await failIp();
    return { ok: false, error: "تم إيقاف تسجيل الدخول مؤقتًا بسبب محاولات خاطئة متكررة. حاول بعد 15 دقيقة أو استعد كلمة المرور.", retryAfter: acct.retryAfterSeconds };
  }
  if (!user) {
    await burnPasswordTime(password);
    await failIp();
    return { ok: false, error: "البريد الإلكتروني أو كلمة المرور غير صحيحة." };
  }
  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    await failIp();
    return { ok: false, error: "البريد الإلكتروني أو كلمة المرور غير صحيحة." };
  }
  if (!user.is_active) return { ok: false, error: "هذا الحساب موقوف. تواصل مع الدعم." };
  await clearRateLimit(accountKey);
  const s = await createSession(user.id, meta);
  return { ok: true, userId: user.id, token: s.token, expiresAt: s.expiresAt };
}

export async function registerStudent(
  input: { fullName: string; email: string; password: string; phone: string | null; gradeId?: string },
  meta: { ip: string; userAgent: string },
): Promise<AuthResult> {
  const limit = await hitRateLimit(`register:ip:${meta.ip}`, 30, 60 * 60);
  if (!limit.allowed) return { ok: false, error: "محاولات تسجيل كثيرة من هذا الجهاز. حاول لاحقًا." };
  const exists = await sql`select 1 from users where email = ${input.email}`;
  if (exists.length) return { ok: false, error: "هذا البريد مسجل مسبقًا. جرّب تسجيل الدخول أو استعادة كلمة المرور." };
  const hash = await hashPassword(input.password);
  let gradeId: string | null = null;
  if (input.gradeId) {
    const g = await sql<{ id: string }[]>`select id from grades where id = ${input.gradeId} and is_published`;
    gradeId = g[0]?.id ?? null;
  }
  try {
    const [user] = await sql<{ id: string }[]>`
      insert into users (email, password_hash, full_name, phone, grade_id, role)
      values (${input.email}, ${hash}, ${input.fullName}, ${input.phone}, ${gradeId}, 'student')
      returning id
    `;
    const s = await createSession(user.id, meta);
    return { ok: true, userId: user.id, token: s.token, expiresAt: s.expiresAt };
  } catch (err) {
    if (String((err as { code?: string }).code) === "23505") return { ok: false, error: "هذا البريد مسجل مسبقًا." };
    throw err;
  }
}

/** طلب استعادة كلمة المرور — الرد موحد دائمًا (لا نكشف وجود الحساب) */
export async function requestPasswordReset(email: string, ip: string): Promise<void> {
  const ipLimit = await hitRateLimit(`reset:ip:${ip}`, 10, 60 * 60);
  const acctLimit = await hitRateLimit(`reset:acct:${email}`, 3, 60 * 60);
  if (!ipLimit.allowed || !acctLimit.allowed) return;
  const [user] = await sql<{ id: string; full_name: string; is_active: boolean }[]>`
    select id, full_name, is_active from users where email = ${email}
  `;
  if (!user || !user.is_active) return;
  const token = generateToken();
  await sql`update password_reset_tokens set used_at = now() where user_id = ${user.id} and used_at is null`;
  await sql`
    insert into password_reset_tokens (id, user_id, expires_at)
    values (${hashToken(token)}, ${user.id}, now() + interval '1 hour')
  `;
  const settings = await getSettings();
  const link = `${env().APP_URL.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}`;
  await sendMail({
    to: email,
    template: "password_reset",
    subject: `استعادة كلمة المرور — ${settings.site_name}`,
    text: `مرحبًا ${user.full_name}،\n\nوصلنا طلب لاستعادة كلمة المرور لحسابك. افتح الرابط التالي خلال ساعة لتعيين كلمة مرور جديدة:\n${link}\n\nإذا لم تطلب ذلك، تجاهل هذه الرسالة وسيبقى حسابك آمنًا.\n\n${settings.site_name}`,
  });
}

export async function resetPassword(token: string, newPassword: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!token || token.length > 100) return { ok: false, error: "الرابط غير صالح." };
  const id = hashToken(token);
  return sql.begin(async (tx) => {
    const [row] = await tx<{ user_id: string; expires_at: Date; used_at: Date | null }[]>`
      select user_id, expires_at, used_at from password_reset_tokens where id = ${id} for update
    `;
    if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) {
      return { ok: false as const, error: "انتهت صلاحية الرابط أو سبق استخدامه. اطلب رابطًا جديدًا." };
    }
    const hash = await hashPassword(newPassword);
    await tx`update users set password_hash = ${hash} where id = ${row.user_id}`;
    await tx`update password_reset_tokens set used_at = now() where id = ${id}`;
    await tx`delete from sessions where user_id = ${row.user_id}`;
    await tx`delete from rate_limits where key like ${"login:acct:%"} and key = (select 'login:acct:' || lower(email::text) from users where id = ${row.user_id})`;
    return { ok: true as const };
  });
}

export async function changePassword(userId: string, current: string, next: string, keepSessionId: string) {
  const [u] = await sql<{ password_hash: string }[]>`select password_hash from users where id = ${userId}`;
  if (!u || !(await verifyPassword(current, u.password_hash))) return { ok: false as const, error: "كلمة المرور الحالية غير صحيحة." };
  await sql`update users set password_hash = ${await hashPassword(next)} where id = ${userId}`;
  await invalidateAllUserSessions(userId, keepSessionId);
  return { ok: true as const };
}
