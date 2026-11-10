import "server-only";
import { STEP_UP_FIELD, STEP_UP_PROOF_MINUTES } from "@/lib/two-factor";
import { count, W } from "@/lib/design";
import { sql } from "../db";
import { AdminError, StepUpRequired } from "../admin/common";
import { audit } from "../platform/audit";
import { getCurrentSession } from "./session";
import { twoFactorIsActive, verifyStepUpCode } from "./two-factor";

/** هل عند هذا المدير عامل ثانٍ؟ تعرضها الواجهة كما هي، ولا تقرر شيئًا */
export async function refundStepUpActive(adminId: string): Promise<boolean> {
  return twoFactorIsActive(adminId);
}

const ENROL_FIRST = "فعّل التحقق بخطوتين على حسابك أولًا، فهذا الأمر لا يعمل بدونه.";
const PROVE_FIRST = `هذا أمر حساس. أكّد هويتك برمز التحقق، ويبقى التأكيد ${count(STEP_UP_PROOF_MINUTES, W.minute)} على هذا الجهاز.`;
const SESSION_ENDED = "انتهت الجلسة، سجّل الدخول مرة أخرى";

/**
 * نقطة التحقق قبل كل أمر يخرج مالًا عبر البوابة: استرداد الطلب وإعادة إرساله واسترداد الدفعة الزائدة وقرارات التعليق.
 * رمز TOTP جديد أو رمز استرداد يُرسل مع نموذج الأمر. الرمز يُستهلك هنا، قبل أن يصل الأمر إلى البوابة.
 * إثبات العشر دقائق لا يكفي هنا: كل أمر برمزه.
 * بلا عامل ثانٍ مسجَّل يُرفض الأمر دائمًا. ADMIN_2FA_REQUIRED=false يسمح بالدخول للتسجيل فقط، ولا يفتح هذا الباب.
 */
export async function assertRefundStepUp(input: { adminId: string; fd: FormData; ip?: string }): Promise<void> {
  if (!(await twoFactorIsActive(input.adminId))) {
    await audit({ actorId: input.adminId, action: "two_factor.step_up_refused", entityType: "user", entityId: input.adminId, metadata: { reason: "not_enrolled" }, ip: input.ip ?? null });
    throw new StepUpRequired(ENROL_FIRST, "enrol");
  }
  const res = await verifyStepUpCode({ userId: input.adminId, code: input.fd.get(STEP_UP_FIELD), ip: input.ip });
  if (res.ok) return;
  await audit({ actorId: input.adminId, action: "two_factor.step_up_refused", entityType: "user", entityId: input.adminId, ip: input.ip ?? null });
  throw new AdminError(res.error);
}

/** الأوامر التي تحتاج إثباتًا حديثًا. كل اسم يظهر في سجل الرفض */
export type ProtectedCommand =
  | "payout.record"
  | "payout.void"
  | "teacher.share"
  | "teacher.account_create"
  | "teacher.account_reset"
  | "teacher.account_active"
  | "teacher.account_remove"
  | "settings.sensitive"
  | "coupon.save"
  | "coupon.activate"
  | "report.export"
  | "student.anonymize"
  | "student.grant"
  | "student.reset_password"
  | "student.correct_email"
  | "student.active"
  | "refund.dismiss"
  | "extra_payment.dismiss";

type ProofRefusal = { need: "proof" | "enrol"; reason: "no_session" | "not_enrolled" | "missing" | "expired"; message: string };

/** المصدر الوحيد لحكم الإثبات: صف الجلسة نفسها وساعة قاعدة البيانات، فلا ذاكرة خادم تختلف عليها النسخ */
async function readProofRefusal(userId: string, sessionId: string): Promise<ProofRefusal | null> {
  const [row] = await sql<{ enrolled: boolean; proved: boolean; live: boolean }[]>`
    select
      exists (select 1 from user_totp t where t.user_id = s.user_id and t.enabled_at is not null) as enrolled,
      s.step_up_at is not null as proved,
      coalesce(s.step_up_at > now() - make_interval(mins => ${STEP_UP_PROOF_MINUTES}), false) as live
    from sessions s
    where s.id = ${sessionId} and s.user_id = ${userId} and s.expires_at > now()
  `;
  if (!row) return { need: "proof", reason: "no_session", message: SESSION_ENDED };
  if (!row.enrolled) return { need: "enrol", reason: "not_enrolled", message: ENROL_FIRST };
  if (row.live) return null;
  return { need: "proof", reason: row.proved ? "expired" : "missing", message: PROVE_FIRST };
}

/** يقرر ويسجل الرفض، ويعيد null إن كان الإثبات صالحًا. مسارات API تحوّل الرفض إلى رد، والإجراءات إلى خطأ */
export async function refuseWithoutProof(input: { adminId: string; sessionId: string | undefined; ip?: string | null; command: ProtectedCommand }): Promise<ProofRefusal | null> {
  const refusal: ProofRefusal | null = input.sessionId ? await readProofRefusal(input.adminId, input.sessionId) : { need: "proof", reason: "no_session", message: SESSION_ENDED };
  if (!refusal) return null;
  await audit({ actorId: input.adminId, action: "two_factor.proof_refused", entityType: "user", entityId: input.adminId, metadata: { command: input.command, reason: refusal.reason }, ip: input.ip ?? null });
  return refusal;
}

/**
 * حارس الأوامر الحساسة: يُستدعى بعد فحص المدخلات وقبل أي كتابة، حتى يعيد المتصفح الطلب نفسه بأمان بعد إدخال الرمز.
 * لا يقبل متغير بيئة ولا إعدادًا يتجاوزه.
 */
export async function assertFreshProof(input: { adminId: string; ip?: string | null; command: ProtectedCommand }): Promise<void> {
  const session = await getCurrentSession();
  const refusal = await refuseWithoutProof({ ...input, sessionId: session && session.user.id === input.adminId ? session.sessionId : undefined });
  if (refusal) throw new StepUpRequired(refusal.message, refusal.need);
}
