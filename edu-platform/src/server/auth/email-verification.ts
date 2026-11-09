import "server-only";
import { sql, type Db } from "../db";
import { env } from "../env";
import { burnPasswordTime, verifyPassword } from "./password";
import { generateToken, hashToken } from "./session";
import { hitRateLimit } from "./rate-limit";
import { audit } from "../platform/audit";
import { mailIsReal, sendMail } from "../platform/mailer";
import { getSettings } from "../platform/settings";

/**
 * تأكيد البريد قبل أول دفع (قرار D4):
 *  - يُفرض فقط حين يكون البريد حقيقيًا (MAIL_DRIVER=smtp)، وإلا فلن يصل الرابط أبدًا.
 *  - التسجيل يبقى فوريًا، والطلبات المجانية لا تُمنع.
 *  - من له طلب مدفوع حقيقي سابق معفى، فلا يُوقف عميل قائم عن الشراء.
 *
 * الرمز يُخزَّن SHA-256 فقط، صالح ٢٤ ساعة ولمرة واحدة، ورابط أحدث يبطل ما قبله.
 * صفحة الرابط لا تؤكد عند الفتح: يلزم ضغط زر، لأن برامج فحص البريد تفتح الروابط وحدها.
 */
export class EmailVerificationRequiredError extends Error {
  constructor() {
    super("email verification required before a first paid checkout");
    this.name = "EmailVerificationRequiredError";
  }
}

const LINK_HOURS = 24;

export function verifyEmailPath(next: string) {
  return `/verify-email?next=${encodeURIComponent(next)}`;
}

export async function emailVerificationRequired(userId: string, db: Db = sql): Promise<boolean> {
  if (!mailIsReal()) return false;
  const [row] = await db<{ required: boolean }[]>`
    select (
      u.email_verified_at is null
      and not exists (
        select 1 from orders o
        where o.user_id = u.id and o.total_fils > 0 and not o.is_test and o.status in ('paid', 'refunded')
      )
    ) as required
    from users u where u.id = ${userId}
  `;
  return row?.required ?? false;
}

export type VerificationState = { required: boolean; email: string; pendingEmail: string | null; linkSent: boolean };

export async function verificationState(userId: string): Promise<VerificationState> {
  const required = await emailVerificationRequired(userId);
  const [row] = await sql<{ email: string; token_email: string | null }[]>`
    select u.email,
      (select t.email from email_verification_tokens t
        where t.user_id = u.id and t.used_at is null and t.expires_at > now()
        order by t.created_at desc limit 1) as token_email
    from users u where u.id = ${userId}
  `;
  const tokenEmail = row?.token_email ?? null;
  return {
    required,
    email: row?.email ?? "",
    linkSent: tokenEmail !== null,
    pendingEmail: tokenEmail && tokenEmail.toLowerCase() !== row!.email.toLowerCase() ? tokenEmail : null,
  };
}

/** ينشئ رابطًا ويرسله. الروابط السابقة لا تبطل إلا بعد نجاح الإرسال، فلا يخسر الطالب رابطًا يعمل */
export async function sendEmailVerificationLink(userId: string, email: string): Promise<boolean> {
  const token = generateToken();
  const id = hashToken(token);
  await sql`
    insert into email_verification_tokens (id, user_id, email, expires_at)
    values (${id}, ${userId}, ${email}, now() + make_interval(hours => ${LINK_HOURS}))
  `;
  const settings = await getSettings();
  const link = `${env().APP_URL.replace(/\/$/, "")}/verify-email/confirm?token=${encodeURIComponent(token)}`;
  const sent = await sendMail({
    to: email,
    template: "email_verification",
    subject: `تأكيد بريدك الإلكتروني، ${settings.site_name}`,
    text: `افتح الرابط التالي خلال ٢٤ ساعة، ثم اضغط «تأكيد البريد»:\n${link}\n\nإذا لم تسجّل في ${settings.site_name} فتجاهل هذه الرسالة، ولن يتغير شيء.\n\n${settings.site_name}`,
  });
  if (!sent) {
    await sql`delete from email_verification_tokens where id = ${id}`;
    return false;
  }
  await sql`update email_verification_tokens set used_at = now() where user_id = ${userId} and id <> ${id} and used_at is null`;
  return true;
}

/** بعد التسجيل مباشرة، خارج مسار الاستجابة. لا يفعل شيئًا والبريد غير حقيقي */
export async function sendRegistrationVerification(userId: string): Promise<void> {
  if (!mailIsReal()) return;
  const [u] = await sql<{ email: string }[]>`select email from users where id = ${userId} and email_verified_at is null`;
  if (u) await sendEmailVerificationLink(userId, u.email);
}

export type VerifyResult = { ok: true; message: string } | { ok: false; error: string };

const RESEND = { cooldownSec: 60, perUser: 6, perIp: 30, windowSec: 60 * 60 };

export async function resendEmailVerification(userId: string, ip: string): Promise<VerifyResult> {
  if (!mailIsReal()) return { ok: false, error: "إرسال البريد غير مفعّل حاليًا." };
  const state = await verificationState(userId);
  if (!state.required) return { ok: false, error: "بريدك مؤكد، ولا يلزم إرسال رابط." };
  const cooldown = await hitRateLimit(`verify:cooldown:${userId}`, 1, RESEND.cooldownSec);
  if (!cooldown.allowed) return { ok: false, error: `أرسلنا رابطًا قبل قليل. يمكنك طلب غيره بعد ${cooldown.retryAfterSeconds < 60 ? "أقل من دقيقة" : "دقيقة"}.` };
  const [perUser, perIp] = await Promise.all([hitRateLimit(`verify:user:${userId}`, RESEND.perUser, RESEND.windowSec), hitRateLimit(`verify:ip:${ip}`, RESEND.perIp, RESEND.windowSec)]);
  if (!perUser.allowed || !perIp.allowed) return { ok: false, error: "طلبت روابط كثيرة. حاول بعد ساعة." };
  const target = state.pendingEmail ?? state.email;
  const sent = await sendEmailVerificationLink(userId, target);
  return sent ? { ok: true, message: "أرسلنا رابطًا جديدًا. افتح أحدث رسالة، فالروابط السابقة لم تعد تعمل." } : { ok: false, error: "تعذر إرسال الرسالة الآن. حاول بعد قليل." };
}

const CORRECTION = { perUser: 5, perIp: 20, perTarget: 3, windowSec: 60 * 60 };
const CORRECTION_ACCEPTED = "إذا كان هذا البريد متاحًا فستصلك عليه رسالة تأكيد. لن يتغير بريد حسابك قبل فتح الرابط.";

export type CorrectionResult = { ok: true; message: string } | { ok: false; error: string; field?: "email" | "currentPassword" };

/**
 * تصحيح الطالب لبريد كتبه خطأ قبل تأكيده. لا يتغير الحساب حتى يُفتح الرابط من العنوان الجديد.
 * الرد واحد سواء كان العنوان محجوزًا أم لا، حتى لا تصبح هذه الصفحة وسيلة لفحص من له حساب.
 * وصاحب العنوان المحجوز يصله تنبيه بلا رابط.
 */
export async function requestEmailCorrection(userId: string, email: string, currentPassword: string, ip: string): Promise<CorrectionResult> {
  if (!mailIsReal()) return { ok: false, error: "إرسال البريد غير مفعّل حاليًا." };
  const [perUser, perIp] = await Promise.all([hitRateLimit(`verify:correct:user:${userId}`, CORRECTION.perUser, CORRECTION.windowSec), hitRateLimit(`verify:correct:ip:${ip}`, CORRECTION.perIp, CORRECTION.windowSec)]);
  if (!perUser.allowed || !perIp.allowed) return { ok: false, error: "محاولات كثيرة. حاول بعد ساعة." };

  const [u] = await sql<{ email: string; password_hash: string; email_verified_at: Date | null }[]>`select email, password_hash, email_verified_at from users where id = ${userId}`;
  if (!u) {
    await burnPasswordTime(currentPassword);
    return { ok: false, error: "انتهت الجلسة، سجّل الدخول مرة أخرى" };
  }
  if (!(await verifyPassword(currentPassword, u.password_hash))) return { ok: false, error: "كلمة المرور غير صحيحة.", field: "currentPassword" };
  if (u.email_verified_at) return { ok: false, error: "بريدك مؤكد. لتغييره تواصل مع إدارة المنصة." };
  if (u.email.toLowerCase() === email) return { ok: false, error: "هذا هو بريدك الحالي. استخدم «إرسال رابط جديد».", field: "email" };

  const perTarget = await hitRateLimit(`verify:correct:target:${email}`, CORRECTION.perTarget, CORRECTION.windowSec);
  if (!perTarget.allowed) return { ok: true, message: CORRECTION_ACCEPTED };

  const taken = await sql`select 1 from users where email = ${email}`;
  if (taken.length) {
    const settings = await getSettings();
    await sendMail({
      to: email,
      template: "email_in_use_notice",
      subject: `محاولة استخدام بريدك، ${settings.site_name}`,
      text: `حاول شخص ربط هذا البريد بحساب آخر في ${settings.site_name}، لكن لك حسابًا مسجلًا به فلم يتغير شيء.\n\nلا حاجة لأي إجراء.\n\n${settings.site_name}`,
    });
    return { ok: true, message: CORRECTION_ACCEPTED };
  }
  await sendEmailVerificationLink(userId, email);
  return { ok: true, message: CORRECTION_ACCEPTED };
}

const CONFIRM_FAILED = "انتهت صلاحية الرابط أو سبق استخدامه. اطلب رابطًا جديدًا من صفحة تأكيد البريد.";

export async function confirmEmailToken(token: string, ip: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!token || token.length > 100) return { ok: false, error: CONFIRM_FAILED };
  const limit = await hitRateLimit(`verify:confirm:ip:${ip}`, 30, 60 * 60);
  if (!limit.allowed) return { ok: false, error: "محاولات كثيرة. حاول بعد قليل." };
  const id = hashToken(token);
  try {
    return await sql.begin(async (tx) => {
      const [row] = await tx<{ user_id: string; email: string; current_email: string; expires_at: Date; used_at: Date | null; is_active: boolean }[]>`
        select t.user_id, t.email, u.email as current_email, t.expires_at, t.used_at, u.is_active
        from email_verification_tokens t join users u on u.id = t.user_id
        where t.id = ${id} for update
      `;
      if (!row || row.used_at || new Date(row.expires_at).getTime() <= Date.now() || !row.is_active) return { ok: false as const, error: CONFIRM_FAILED };
      await tx`update users set email = ${row.email}, email_verified_at = now() where id = ${row.user_id}`;
      await tx`update email_verification_tokens set used_at = now() where user_id = ${row.user_id} and used_at is null`;
      if (row.email.toLowerCase() !== row.current_email.toLowerCase()) {
        // روابط الاستعادة خرجت إلى العنوان القديم
        await tx`update password_reset_tokens set used_at = now() where user_id = ${row.user_id} and used_at is null`;
        await audit({ actorId: row.user_id, action: "user.email_corrected_by_student", entityType: "user", entityId: row.user_id, metadata: { from: row.current_email, to: row.email }, ip }, tx);
      }
      return { ok: true as const };
    });
  } catch (err) {
    // العنوان حُجز بين إصدار الرابط وفتحه
    if ((err as { code?: string }).code === "23505") return { ok: false, error: CONFIRM_FAILED };
    throw err;
  }
}
