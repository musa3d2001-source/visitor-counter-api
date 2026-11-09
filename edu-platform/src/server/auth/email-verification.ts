import "server-only";
import { sql, type Db } from "../db";
import { env } from "../env";
import { burnPasswordTime, verifyPassword } from "./password";
import { generateToken, hashToken } from "./session";
import { clearRateLimit, hitRateLimit } from "./rate-limit";
import { constantTimeEqual } from "./two-factor-core";
import { audit } from "../platform/audit";
import { mailIsReal, redactSecrets, sendMail } from "../platform/mailer";
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

export const VERIFICATION_LINK_HOURS = 24;

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

/** مع كل تغيير لكلمة المرور: رابط طُلب قبله لا يصلح بعده، وخاصة رابط يغيّر عنوان الحساب */
export async function revokeEmailLinks(db: Db, userId: string) {
  await db`update email_verification_tokens set used_at = now() where user_id = ${userId} and used_at is null`;
}

/**
 * ينشئ رابطًا ويرسله. الروابط السابقة لا تبطل إلا بعد نجاح الإرسال، فلا يخسر الطالب رابطًا يعمل.
 * verifiedPasswordHash: الهاش الذي تحققنا منه للتو. الإدراج مشروط ببقائه هو نفسه، وبصمته تُحفظ مع الرابط،
 * فتغيير كلمة المرور في أي لحظة بعد الفحص يبطل الرابط ولو سبق الإدراج نفسه.
 */
export async function sendEmailVerificationLink(userId: string, email: string, opts: { verifiedPasswordHash?: string } = {}): Promise<boolean> {
  const token = generateToken();
  const id = hashToken(token);
  const fingerprint = opts.verifiedPasswordHash ? hashToken(opts.verifiedPasswordHash) : null;
  const inserted = await sql`
    insert into email_verification_tokens (id, user_id, email, password_fingerprint, expires_at)
    select ${id}, u.id, ${email}::citext, ${fingerprint}, now() + make_interval(hours => ${VERIFICATION_LINK_HOURS})
    from users u
    where u.id = ${userId} and u.anonymized_at is null ${opts.verifiedPasswordHash ? sql`and u.password_hash = ${opts.verifiedPasswordHash}` : sql``}
    returning id
  `;
  if (inserted.length === 0) return false;
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

const RESEND = { cooldownSec: 60, perUser: 6, perIp: 200, windowSec: 60 * 60 };
const SEND_FAILED = "تعذر إرسال الرسالة الآن. حاول بعد قليل.";

export async function resendEmailVerification(userId: string, ip: string): Promise<VerifyResult> {
  if (!mailIsReal()) return { ok: false, error: "إرسال البريد غير مفعّل حاليًا." };
  const state = await verificationState(userId);
  if (!state.required) return { ok: false, error: "بريدك مؤكد، ولا يلزم إرسال رابط." };
  const cooldownKey = `verify:cooldown:${userId}`;
  const cooldown = await hitRateLimit(cooldownKey, 1, RESEND.cooldownSec);
  if (!cooldown.allowed) return { ok: false, error: `أرسلنا رابطًا قبل قليل. يمكنك طلب غيره بعد ${cooldown.retryAfterSeconds < 60 ? "أقل من دقيقة" : "دقيقة"}.` };
  const [perUser, perIp] = await Promise.all([hitRateLimit(`verify:user:${userId}`, RESEND.perUser, RESEND.windowSec), hitRateLimit(`verify:ip:${ip}`, RESEND.perIp, RESEND.windowSec)]);
  if (!perUser.allowed || !perIp.allowed) return { ok: false, error: "طلبت روابط كثيرة. حاول بعد ساعة." };
  // عنوان الحساب فقط: الإرسال إلى عنوان آخر لا يكون إلا بكلمة المرور، عبر نموذج التصحيح
  const sent = await sendEmailVerificationLink(userId, state.email);
  if (sent) return { ok: true, message: "أرسلنا رابطًا جديدًا. افتح أحدث رسالة، فالروابط السابقة لم تعد تعمل." };
  // لم يخرج شيء، فلا نقل له لاحقًا «أرسلنا رابطًا قبل قليل»
  await clearRateLimit(cooldownKey);
  return { ok: false, error: SEND_FAILED };
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
  // بريد مؤكد، أو حساب له طلب مدفوع حقيقي: إيصالاته وصلت إلى هذا العنوان، فالتغيير بيد المالك
  if (!(await emailVerificationRequired(userId))) return { ok: false, error: "لا يمكن تغيير بريد هذا الحساب من هنا. تواصل مع إدارة المنصة." };
  if (u.email.toLowerCase() === email) {
    // الرجوع عن تصحيح سابق: رابط جديد لعنوان الحساب يبطل الرابط المرسل إلى العنوان الآخر
    if (!(await verificationState(userId)).pendingEmail) return { ok: false, error: "هذا هو بريدك الحالي. استخدم «إرسال رابط جديد».", field: "email" };
    const sent = await sendEmailVerificationLink(userId, email, { verifiedPasswordHash: u.password_hash });
    return sent ? { ok: true, message: CORRECTION_ACCEPTED } : { ok: false, error: SEND_FAILED };
  }

  const perTarget = await hitRateLimit(`verify:correct:target:${email}`, CORRECTION.perTarget, CORRECTION.windowSec);
  if (!perTarget.allowed) return { ok: true, message: CORRECTION_ACCEPTED };

  const taken = await sql`select 1 from users where email = ${email}`;
  if (taken.length) {
    const settings = await getSettings();
    // فشل الإرسال هنا وفي الفرع التالي يعطي الرد نفسه، فلا يكشف أن العنوان محجوز
    const noticed = await sendMail({
      to: email,
      template: "email_in_use_notice",
      subject: `محاولة استخدام بريدك، ${settings.site_name}`,
      text: `حاول شخص ربط هذا البريد بحساب آخر في ${settings.site_name}، لكن لك حسابًا مسجلًا به فلم يتغير شيء.\n\nلا حاجة لأي إجراء.\n\n${settings.site_name}`,
    });
    return noticed ? { ok: true, message: CORRECTION_ACCEPTED } : { ok: false, error: SEND_FAILED };
  }
  const sent = await sendEmailVerificationLink(userId, email, { verifiedPasswordHash: u.password_hash });
  return sent ? { ok: true, message: CORRECTION_ACCEPTED } : { ok: false, error: SEND_FAILED };
}

const CONFIRM_FAILED = "انتهت صلاحية الرابط أو سبق استخدامه. اطلب رابطًا جديدًا من صفحة تأكيد البريد.";

export async function confirmEmailToken(token: string, ip: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!token || token.length > 100) return { ok: false, error: CONFIRM_FAILED };
  const id = hashToken(token);
  let outcome: { ok: true; previousEmail: string | null } | { ok: false; error: string };
  try {
    outcome = await sql.begin(async (tx) => {
      const [row] = await tx<{ user_id: string; email: string; current_email: string; expires_at: Date; used_at: Date | null; is_active: boolean; password_fingerprint: string | null; password_hash: string }[]>`
        select t.user_id, t.email, u.email as current_email, t.expires_at, t.used_at, u.is_active, t.password_fingerprint, u.password_hash
        from email_verification_tokens t join users u on u.id = t.user_id
        where t.id = ${id} for update
      `;
      if (!row || row.used_at || new Date(row.expires_at).getTime() <= Date.now() || !row.is_active) return { ok: false as const, error: CONFIRM_FAILED };
      // الرابط يغيّر عنوان الحساب ولا يتطلب جلسة، فلا يعمل إلا إن بقيت كلمة المرور التي طُلب بها
      const changesAddress = row.email.toLowerCase() !== row.current_email.toLowerCase();
      if (changesAddress && !(row.password_fingerprint && constantTimeEqual(row.password_fingerprint, hashToken(row.password_hash)))) return { ok: false as const, error: CONFIRM_FAILED };
      await tx`update users set email = ${row.email}, email_verified_at = now() where id = ${row.user_id}`;
      await tx`update email_verification_tokens set used_at = now() where user_id = ${row.user_id} and used_at is null`;
      if (changesAddress) {
        // روابط الاستعادة خرجت إلى العنوان القديم
        await tx`update password_reset_tokens set used_at = now() where user_id = ${row.user_id} and used_at is null`;
        await audit({ actorId: row.user_id, action: "user.email_corrected_by_student", entityType: "user", entityId: row.user_id, metadata: { from: row.current_email, to: row.email }, ip }, tx);
      }
      return { ok: true as const, previousEmail: changesAddress ? row.current_email : null };
    });
  } catch (err) {
    // العنوان حُجز بين إصدار الرابط وفتحه
    if ((err as { code?: string }).code !== "23505") throw err;
    outcome = { ok: false, error: CONFIRM_FAILED };
  }
  if (!outcome.ok) {
    // لا يُحتسب إلا الفشل، فرابط صحيح يعمل دائمًا مهما كان عدد من يؤكدون من شبكة المدرسة
    const limit = await hitRateLimit(`verify:confirm:ip:${ip}`, 30, 60 * 60);
    return limit.allowed ? outcome : { ok: false, error: "محاولات كثيرة. حاول بعد قليل." };
  }
  if (outcome.previousEmail) await tellOldAddress(outcome.previousEmail);
  return { ok: true };
}

/** العنوان السابق يعرف أن الحساب غادره، ولو كان التغيير بكلمة مرور مسروقة. لا يذكر العنوان الجديد ولا الاسم. وفشله لا يلغي تأكيدًا تم */
async function tellOldAddress(previous: string) {
  try {
    const settings = await getSettings();
    await sendMail({
      to: previous,
      template: "email_changed_notice",
      subject: `تغيّر البريد المرتبط بحسابك، ${settings.site_name}`,
      text: `تغيّر البريد المرتبط بحساب كان يستخدم هذا العنوان، فلن تصل إليه رسائل الحساب بعد الآن.\n\nإذا لم تطلب ذلك فتواصل معنا.\n\n${settings.site_name}`,
    });
  } catch (err) {
    console.error("[auth] old address notice failed", redactSecrets(err instanceof Error ? err.message : String(err)));
  }
}
