import "server-only";
import { sql } from "../db";
import { adminTwoFactorRequired, env } from "../env";
import { hashPassword, verifyPassword, burnPasswordTime } from "./password";
import { createSession, createSessionIn, generateToken, hashToken } from "./session";
import { hitRateLimit, clearRateLimit, peekRateLimit, reserveFailureSlot, type FailurePolicy } from "./rate-limit";
import { completeLoginChallenge, startLoginChallenge, twoFactorIsActive, type CompleteChallengeResult } from "./two-factor";
import { revokeEmailLinks } from "./email-verification";
import { mailIsReal, sendMail } from "../platform/mailer";
import { getSettings } from "../platform/settings";
import { audit } from "../platform/audit";
import { consentMeta, recordConsent } from "../platform/consent";
import { ACCOUNT_CONSENT_KINDS } from "@/lib/consent";
import { passwordPolicyError, type PasswordRole } from "@/lib/password-policy";
import { count, W } from "@/lib/design";

/** منطق المصادقة (بدون اعتماد على سياق الطلب لسهولة الاختبار) */

export type AuthResult =
  | { ok: true; userId: string; token: string; expiresAt: Date; mustChangePassword?: boolean; needsTwoFactorEnrolment?: boolean }
  /** challenge: كلمة المرور صحيحة لكن الدخول لم يكتمل. لا جلسة بعد، فتجاهله يعني فشل الدخول */
  | { ok: false; error: string; retryAfter?: number; challenge?: { token: string; expiresAt: Date } };

/**
 * حدود الدخول: تُحتسب الإخفاقات فقط، والدخول الناجح لا يُحتسب أبدًا.
 *
 *  - لكل زوج (حساب + IP): ٥ محاولات خاطئة بلا تأخير، ثم انتظار ٣٠ ثانية يتضاعف حتى ١٥ دقيقة.
 *    تُنسى بعد ساعة بلا محاولات، وتُمسح عند أول كلمة مرور صحيحة.
 *    المفتاح يجمع الاثنين عن قصد: زميل في شبكة المدرسة نفسها لا يقفل حسابك،
 *    ومهاجم يعرف بريدك لا يستطيع قفله من شبكة أخرى.
 *  - لكل IP: ١٠٠ حساب مختلف فشل الدخول إليها خلال ١٥ دقيقة. يوقف تجربة كلمة واحدة على قائمة حسابات،
 *    ويُحتسب الحساب مرة واحدة، فأخطاء طلاب فصل كامل في كلماتهم لا تكاد تقترب منه.
 *
 *  الحجز يسبق فحص كلمة المرور حتى لا تتجاوز طلبات متوازية الحد، ثم يُمسح إن كانت الكلمة صحيحة.
 *  يعتمد هذا على عنوان IP لا يزوّره العميل: انظر TRUST_PROXY و clientIp، وعلى Vercel تضبطه المنصة نفسها.
 */
const LOGIN_FAILURES: FailurePolicy = { freeFailures: 5, firstDelaySeconds: 30, maxDelaySeconds: 15 * 60, forgetAfterSeconds: 60 * 60 };
const LOGIN_IP = { failingAccounts: 100, windowSec: 15 * 60 };

/** جلسة تغيير كلمة المرور المؤقتة قصيرة، ولا تفتح أي صفحة أخرى */
const MUST_CHANGE_SESSION_MS = 60 * 60 * 1000;

export function loginFailurePrefix(email: string) {
  return `login:fail:${email.toLowerCase()}|`;
}

function lockoutMessage(retryAfterSeconds: number) {
  const remaining = retryAfterSeconds < 60 ? "أقل من دقيقة" : count(Math.ceil(retryAfterSeconds / 60), W.minute);
  return `تم إيقاف تسجيل الدخول مؤقتًا بسبب محاولات خاطئة متكررة. المدة المتبقية: ${remaining}.${mailIsReal() ? " ويمكنك استعادة كلمة المرور إن نسيتها." : ""}`;
}

export async function loginWithPassword(email: string, password: string, meta: { ip: string; userAgent: string }): Promise<AuthResult> {
  const failureKey = `${loginFailurePrefix(email)}${meta.ip}`;
  const ipKey = `login:ipfail:${meta.ip}`;
  const ipState = await peekRateLimit(ipKey, LOGIN_IP.failingAccounts);
  if (ipState.blocked) return { ok: false, error: "محاولات كثيرة. حاول مرة أخرى بعد قليل.", retryAfter: ipState.retryAfterSeconds };

  // السلوك واحد لبريد مسجل وغير مسجل: لا تأخير ولا رسالة تكشف وجود الحساب
  const slot = await reserveFailureSlot(failureKey, LOGIN_FAILURES);
  if (!slot.allowed) return { ok: false, error: lockoutMessage(slot.retryAfterSeconds), retryAfter: slot.retryAfterSeconds };

  const failed = async (): Promise<AuthResult> => {
    if (slot.failures === 1) await hitRateLimit(ipKey, LOGIN_IP.failingAccounts, LOGIN_IP.windowSec);
    return { ok: false, error: "البريد الإلكتروني أو كلمة المرور غير صحيحة." };
  };

  const [user] = await sql<{ id: string; password_hash: string; role: PasswordRole; is_active: boolean; must_change_password: boolean; temp_password_expires_at: Date | null }[]>`
    select id, password_hash, role, is_active, must_change_password, temp_password_expires_at from users where email = ${email}
  `;
  if (!user) {
    await burnPasswordTime(password);
    return failed();
  }
  if (!(await verifyPassword(password, user.password_hash))) return failed();

  // كلمة صحيحة: ليست إخفاقًا مهما كانت حالة الحساب بعدها
  await clearRateLimit(failureKey);
  if (!user.is_active) return { ok: false, error: "هذا الحساب موقوف. تواصل مع الدعم." };

  // مدير فعّل التحقق بخطوتين: لا جلسة من كلمة المرور وحدها
  if (user.role === "admin" && (await twoFactorIsActive(user.id))) {
    const challenge = await startLoginChallenge(user.id);
    if (!challenge.ok) return challenge;
    return { ok: false, error: "أدخل رمز التحقق لإكمال الدخول.", challenge: { token: challenge.token, expiresAt: challenge.expiresAt } };
  }

  if (user.must_change_password && user.temp_password_expires_at) {
    // تحديث ذري: كلمة المرور المؤقتة تفتح جلسة واحدة فقط مهما تزامنت الطلبات
    const claimed = await sql`
      update users set temp_password_expires_at = now()
      where id = ${user.id} and must_change_password and temp_password_expires_at > now()
      returning id
    `;
    if (claimed.length === 0) return { ok: false, error: "انتهت صلاحية كلمة المرور المؤقتة أو سبق استخدامها. تواصل مع إدارة المنصة لتصدر لك واحدة جديدة." };
  }
  if (user.must_change_password) {
    const s = await createSession(user.id, meta, { ttlMs: MUST_CHANGE_SESSION_MS });
    return { ok: true, userId: user.id, token: s.token, expiresAt: s.expiresAt, mustChangePassword: true };
  }
  const s = await createSession(user.id, meta);
  // إلزامي وغير مسجَّل: الجلسة لا تفتح إلا صفحة التسجيل (انظر getCurrentUser)
  return { ok: true, userId: user.id, token: s.token, expiresAt: s.expiresAt, needsTwoFactorEnrolment: user.role === "admin" && adminTwoFactorRequired() };
}

/** الخطوة الثانية لدخول المدير. جلسة كلمة المرور المؤقتة تُحترم بعد الرمز كما قبله */
export async function completeTwoFactorLogin(token: string | undefined, code: unknown, meta: { ip: string; userAgent: string }): Promise<CompleteChallengeResult> {
  return completeLoginChallenge({ token, code, ip: meta.ip, userAgent: meta.userAgent, mustChangeTtlMs: MUST_CHANGE_SESSION_MS });
}

export async function registerStudent(
  input: { fullName: string; email: string; password: string; phone: string | null; gradeId?: string; acceptedDocuments: boolean },
  meta: { ip: string; userAgent: string },
): Promise<AuthResult> {
  if (!input.acceptedDocuments) return { ok: false, error: "يجب الموافقة على الشروط والأحكام وسياسة الخصوصية." };
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
    // الحساب وموافقته وجلسته معًا: لا يوجد حساب بلا ما وافق عليه
    return await sql.begin(async (tx): Promise<AuthResult> => {
      const [user] = await tx<{ id: string }[]>`
        insert into users (email, password_hash, full_name, phone, grade_id, role)
        values (${input.email}, ${hash}, ${input.fullName}, ${input.phone}, ${gradeId}, 'student')
        returning id
      `;
      for (const kind of ACCOUNT_CONSENT_KINDS) await recordConsent(tx, { userId: user.id, kind, meta: consentMeta(meta) });
      const s = await createSessionIn(tx, user.id, meta);
      return { ok: true, userId: user.id, token: s.token, expiresAt: s.expiresAt };
    });
  } catch (err) {
    if (String((err as { code?: string }).code) === "23505") return { ok: false, error: "هذا البريد مسجل مسبقًا." };
    throw err;
  }
}

/**
 * طلب استعادة كلمة المرور — الرد موحد دائمًا (لا نكشف وجود الحساب).
 * حساب المدير لا يستعيد عبر البريد (انظر سياسة password-policy): يصله تنبيه بلا رابط.
 */
export async function requestPasswordReset(email: string, ip: string): Promise<void> {
  const ipLimit = await hitRateLimit(`reset:ip:${ip}`, 10, 60 * 60);
  const acctLimit = await hitRateLimit(`reset:acct:${email}`, 3, 60 * 60);
  if (!ipLimit.allowed || !acctLimit.allowed) return;
  const [user] = await sql<{ id: string; full_name: string; is_active: boolean; role: PasswordRole }[]>`
    select id, full_name, is_active, role from users where email = ${email}
  `;
  if (!user || !user.is_active) return;
  const settings = await getSettings();
  if (user.role === "admin") {
    await sendMail({
      to: email,
      template: "password_reset_refused",
      subject: `طلب استعادة كلمة المرور، ${settings.site_name}`,
      text: `وصلنا طلب لاستعادة كلمة مرور هذا الحساب الإداري. حسابات الإدارة لا تُستعاد عبر البريد، فلم يتغير شيء.\n\nإذا لم تطلب ذلك فقد يكون أحدهم يحاول الوصول إلى الحساب.\n\n${settings.site_name}`,
    });
    return;
  }
  const token = generateToken();
  await sql`update password_reset_tokens set used_at = now() where user_id = ${user.id} and used_at is null`;
  await sql`
    insert into password_reset_tokens (id, user_id, expires_at)
    values (${hashToken(token)}, ${user.id}, now() + interval '1 hour')
  `;
  const link = `${env().APP_URL.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}`;
  await sendMail({
    to: email,
    template: "password_reset",
    subject: `استعادة كلمة المرور، ${settings.site_name}`,
    text: `مرحبًا ${user.full_name}،\n\nوصلنا طلب لاستعادة كلمة المرور لحسابك. افتح الرابط التالي خلال ساعة لتعيين كلمة مرور جديدة:\n${link}\n\nإذا لم تطلب ذلك، تجاهل هذه الرسالة وسيبقى حسابك آمنًا.\n\n${settings.site_name}`,
  });
}

export async function resetPassword(token: string, newPassword: string): Promise<{ ok: true } | { ok: false; error: string; field?: "password" }> {
  if (!token || token.length > 100) return { ok: false, error: "الرابط غير صالح." };
  const id = hashToken(token);
  return sql.begin(async (tx) => {
    const [row] = await tx<{ user_id: string; expires_at: Date; used_at: Date | null; role: PasswordRole; email: string }[]>`
      select t.user_id, t.expires_at, t.used_at, u.role, u.email
      from password_reset_tokens t join users u on u.id = t.user_id
      where t.id = ${id} for update of t
    `;
    if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now() || row.role === "admin") {
      return { ok: false as const, error: "انتهت صلاحية الرابط أو سبق استخدامه. اطلب رابطًا جديدًا." };
    }
    // الرفض قبل استهلاك الرمز: الطالب يصحح كلمته بالرابط نفسه
    const problem = passwordPolicyError(row.role, newPassword, row.email);
    if (problem) return { ok: false as const, error: problem, field: "password" as const };
    const hash = await hashPassword(newPassword);
    await tx`update users set password_hash = ${hash}, must_change_password = false, temp_password_expires_at = null where id = ${row.user_id}`;
    await tx`update password_reset_tokens set used_at = now() where user_id = ${row.user_id} and used_at is null`;
    await revokeEmailLinks(tx, row.user_id);
    await tx`delete from sessions where user_id = ${row.user_id}`;
    await tx`delete from rate_limits where starts_with(key, ${loginFailurePrefix(row.email)})`;
    return { ok: true as const };
  });
}

/** محاولات كلمة المرور الحالية من جلسة مفتوحة: من سرق جلسة لا يخمّنها */
const CHANGE_PASSWORD_FAILURES: FailurePolicy = { freeFailures: 5, firstDelaySeconds: 60, maxDelaySeconds: 15 * 60, forgetAfterSeconds: 60 * 60 };

export type ChangePasswordResult = { ok: true } | { ok: false; error: string; field: "currentPassword" | "newPassword" };

export async function changePassword(userId: string, current: string, next: string, keepSessionId: string): Promise<ChangePasswordResult> {
  const key = `pwchange:fail:${userId}`;
  const slot = await reserveFailureSlot(key, CHANGE_PASSWORD_FAILURES);
  if (!slot.allowed) return { ok: false, error: "محاولات كثيرة. حاول مرة أخرى بعد قليل.", field: "currentPassword" };
  const [u] = await sql<{ password_hash: string; role: PasswordRole; email: string }[]>`select password_hash, role, email from users where id = ${userId}`;
  if (!u || !(await verifyPassword(current, u.password_hash))) return { ok: false, error: "كلمة المرور الحالية غير صحيحة.", field: "currentPassword" };
  await clearRateLimit(key);
  const problem = passwordPolicyError(u.role, next, u.email);
  if (problem) return { ok: false, error: problem, field: "newPassword" };
  const hash = await hashPassword(next);
  await sql.begin(async (tx) => {
    await tx`update users set password_hash = ${hash} where id = ${userId}`;
    await tx`update password_reset_tokens set used_at = now() where user_id = ${userId} and used_at is null`;
    await revokeEmailLinks(tx, userId);
    await tx`delete from sessions where user_id = ${userId} and id <> ${keepSessionId}`;
    // خطوة كلمة مرور معلقة بالكلمة القديمة لا تكتمل بعد تغييرها
    await tx`delete from login_challenges where user_id = ${userId}`;
  });
  return { ok: true };
}

export type ForcedChangeResult = { ok: true; token: string; expiresAt: Date } | { ok: false; error: string; field?: "password" };

/**
 * إنهاء كلمة المرور المؤقتة: تعيين كلمة الطالب الخاصة، إلغاء كل الجلسات والروابط، ثم جلسة كاملة جديدة.
 * من يصل هنا أثبت نفسه بالكلمة المؤقتة خلال الساعة الماضية، فلا نطلبها مرة أخرى.
 */
export async function completeForcedPasswordChange(userId: string, next: string, meta: { ip: string; userAgent: string }): Promise<ForcedChangeResult> {
  const limit = await hitRateLimit(`pwforced:user:${userId}`, 20, 15 * 60);
  if (!limit.allowed) return { ok: false, error: "محاولات كثيرة. حاول مرة أخرى بعد قليل." };
  const [u] = await sql<{ password_hash: string; role: PasswordRole; email: string; must_change_password: boolean }[]>`
    select password_hash, role, email, must_change_password from users where id = ${userId}
  `;
  if (!u?.must_change_password) return { ok: false, error: "لا يلزم تغيير كلمة المرور لهذا الحساب." };
  const problem = passwordPolicyError(u.role, next, u.email);
  if (problem) return { ok: false, error: problem, field: "password" };
  if (await verifyPassword(next, u.password_hash)) return { ok: false, error: "اختر كلمة مرور غير الكلمة المؤقتة.", field: "password" };
  const hash = await hashPassword(next);
  const changed = await sql.begin(async (tx) => {
    const updated = await tx`
      update users set password_hash = ${hash}, must_change_password = false, temp_password_expires_at = null
      where id = ${userId} and must_change_password returning id
    `;
    if (updated.length === 0) return false;
    await tx`update password_reset_tokens set used_at = now() where user_id = ${userId} and used_at is null`;
    await revokeEmailLinks(tx, userId);
    await tx`delete from sessions where user_id = ${userId}`;
    await audit({ actorId: userId, action: "user.temporary_password_replaced", entityType: "user", entityId: userId, ip: meta.ip }, tx);
    return true;
  });
  if (!changed) return { ok: false, error: "لا يلزم تغيير كلمة المرور لهذا الحساب." };
  const s = await createSession(userId, meta);
  return { ok: true, token: s.token, expiresAt: s.expiresAt };
}
