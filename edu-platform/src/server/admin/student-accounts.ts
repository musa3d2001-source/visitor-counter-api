import "server-only";
import { randomBytes } from "node:crypto";
import { sql } from "../db";
import { env } from "../env";
import { hashPassword } from "../auth/password";
import { generateToken, hashToken } from "../auth/session";
import { hitRateLimit } from "../auth/rate-limit";
import { loginFailurePrefix } from "../auth/service";
import { sendEmailVerificationLink } from "../auth/email-verification";
import { audit } from "../platform/audit";
import { mailIsReal, redactSecrets, sendMail } from "../platform/mailer";
import { getSettings } from "../platform/settings";
import { emailSchema } from "@/lib/validation";
import { AdminError } from "./common";

/**
 * استعادة حساب الطالب بيد المالك، لأن البريد قد لا يكون مفعّلًا والطالب قد يكون نسي بريده.
 *
 * يصدر المالك رابطًا وكلمة مؤقتة معًا فيختار ما يناسب الهاتف أو واتساب. كلاهما يعمل ٢٤ ساعة ومرة واحدة،
 * واستخدام أحدهما يبطل الآخر. الكلمة المؤقتة لا تفتح إلا صفحة تعيين كلمة جديدة.
 * لا يُخزَّن أي منهما خامًا، لا في قاعدة البيانات ولا في سجل التدقيق: تظهر للمالك مرة واحدة.
 */
const OWNER_SECRET_HOURS = 24;

const LIMITS = { perAdmin: 30, perStudent: 5, windowSec: 60 * 60 };

async function enforceOwnerLimits(kind: string, adminId: string, studentId: string) {
  const [admin, student] = await Promise.all([hitRateLimit(`${kind}:admin:${adminId}`, LIMITS.perAdmin, LIMITS.windowSec), hitRateLimit(`${kind}:user:${studentId}`, LIMITS.perStudent, LIMITS.windowSec)]);
  if (!admin.allowed || !student.allowed) throw new AdminError("محاولات كثيرة على هذا الحساب. حاول بعد قليل.");
}

/** ٣٢ حرفًا بلا حروف ملتبسة (0 و O و 1 و I)، و byte & 31 يبقي التوزيع متساويًا. ٦٠ بت عشوائية */
const TEMP_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateTemporaryPassword(): string {
  const chars = Array.from(randomBytes(12), (b) => TEMP_ALPHABET[b & 31]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4, 8).join("")}-${chars.slice(8).join("")}`;
}

function requireStudentRole(role: string | undefined) {
  if (!role) throw new AdminError("المستخدم غير موجود");
  if (role !== "student") throw new AdminError("هذا الإجراء لحسابات الطلاب فقط");
}

async function safeNotify(send: () => Promise<unknown>, label: string) {
  // فشل التنبيه لا يضيّع على المالك ما صدر بالفعل
  try {
    await send();
  } catch (err) {
    console.error(`[student-account] ${label} failed`, redactSecrets(err instanceof Error ? err.message : String(err)));
  }
}

export async function resetStudentPassword(input: { studentId: string; adminId: string; reason: string; ip?: string }): Promise<{ link: string; temporaryPassword: string }> {
  await enforceOwnerLimits("owner-reset", input.adminId, input.studentId);
  const temporaryPassword = generateTemporaryPassword();
  const hash = await hashPassword(temporaryPassword);
  const token = generateToken();

  const student = await sql.begin(async (tx) => {
    const [u] = await tx<{ email: string; role: string }[]>`select email, role from users where id = ${input.studentId} for update`;
    requireStudentRole(u?.role);
    await tx`
      update users set password_hash = ${hash}, must_change_password = true,
        temp_password_expires_at = now() + make_interval(hours => ${OWNER_SECRET_HOURS})
      where id = ${input.studentId}
    `;
    await tx`update password_reset_tokens set used_at = now() where user_id = ${input.studentId} and used_at is null`;
    await tx`
      insert into password_reset_tokens (id, user_id, expires_at)
      values (${hashToken(token)}, ${input.studentId}, now() + make_interval(hours => ${OWNER_SECRET_HOURS}))
    `;
    await tx`delete from sessions where user_id = ${input.studentId}`;
    await tx`delete from rate_limits where starts_with(key, ${loginFailurePrefix(u!.email)})`;
    await audit(
      { actorId: input.adminId, action: "student.password_reset", entityType: "user", entityId: input.studentId, reason: input.reason, metadata: { method: "owner_link_and_temporary_password", validHours: OWNER_SECRET_HOURS }, ip: input.ip },
      tx,
    );
    return u!;
  });

  if (mailIsReal()) {
    await safeNotify(async () => {
      const settings = await getSettings();
      await sendMail({
        to: student.email,
        template: "password_reset_notice",
        subject: `تم إعادة تعيين كلمة مرور حسابك، ${settings.site_name}`,
        text: `أعادت إدارة المنصة تعيين كلمة مرور حسابك بناءً على طلب استعادة، وتم تسجيل خروجك من كل الأجهزة.\n\nإذا لم تطلب ذلك فتواصل معنا.\n\n${settings.site_name}`,
      });
    }, "reset notice");
  }

  return { link: `${env().APP_URL.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}`, temporaryPassword };
}

/** تصحيح بريد الطالب بيد المالك: البريد الجديد غير مؤكد، والقديم يُنبَّه دون أن يعرف الجديد */
export async function correctStudentEmail(input: { studentId: string; newEmail: string; adminId: string; reason: string; ip?: string }): Promise<{ email: string }> {
  const parsed = emailSchema.safeParse(input.newEmail);
  if (!parsed.success) throw new AdminError(parsed.error.issues[0].message, { email: parsed.error.issues[0].message });
  await enforceOwnerLimits("owner-email", input.adminId, input.studentId);
  const email = parsed.data;

  let previous: string;
  try {
    previous = await sql.begin(async (tx) => {
      const [u] = await tx<{ email: string; role: string }[]>`select email, role from users where id = ${input.studentId} for update`;
      requireStudentRole(u?.role);
      if (u!.email.toLowerCase() === email) throw new AdminError("هذا هو البريد الحالي للطالب", { email: "هذا هو البريد الحالي للطالب" });
      await tx`update users set email = ${email}, email_verified_at = null where id = ${input.studentId}`;
      // رابط صدر للعنوان القديم لا يعمل بعد التصحيح
      await tx`update password_reset_tokens set used_at = now() where user_id = ${input.studentId} and used_at is null`;
      await tx`update email_verification_tokens set used_at = now() where user_id = ${input.studentId} and used_at is null`;
      await audit({ actorId: input.adminId, action: "student.email_corrected", entityType: "user", entityId: input.studentId, reason: input.reason, metadata: { from: u!.email, to: email }, ip: input.ip }, tx);
      return u!.email;
    });
  } catch (err) {
    if ((err as { code?: string }).code === "23505") throw new AdminError("هذا البريد مستخدم في حساب آخر", { email: "هذا البريد مستخدم في حساب آخر" });
    throw err;
  }

  if (mailIsReal()) {
    await safeNotify(async () => {
      const settings = await getSettings();
      await sendMail({
        to: previous,
        template: "email_changed_notice",
        subject: `تغيّر البريد المرتبط بحسابك، ${settings.site_name}`,
        text: `صحّحت إدارة المنصة البريد المرتبط بحساب كان يستخدم هذا العنوان، فلن تصل إليه رسائل الحساب بعد الآن.\n\nإذا لم تطلب ذلك فتواصل معنا.\n\n${settings.site_name}`,
      });
    }, "old address notice");
    await safeNotify(() => sendEmailVerificationLink(input.studentId, email), "verification link");
  }

  return { email };
}
