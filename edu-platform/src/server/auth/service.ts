import "server-only";
import { sql } from "../db";
import { adminTwoFactorRequired, env } from "../env";
import { hashPassword, verifyPassword, burnPasswordTime } from "./password";
import { HASH_BUSY_RETRY_AFTER_SECONDS, isHashBusy, withHashSlot } from "./hash-gate";
import { loginFailurePrefix } from "./password-core";
import { createSession, createSessionIn, generateToken, hashToken, InactiveAccountError, type SecondFactorMethod } from "./session";
import { hitRateLimit, clearRateLimit, peekRateLimit, releaseFailureSlot, reserveFailureSlot, settleCorrectPassword, type FailurePolicy } from "./rate-limit";
import { completeLoginChallenge, startLoginChallenge, twoFactorIsActive, type CompleteChallengeResult } from "./two-factor";
import { revokeEmailLinks } from "./email-verification";
import { deviceProofKey, issueDeviceProof, verifyDeviceProof } from "./device-proof";
import { mailIsReal, sendMail } from "../platform/mailer";
import { getSettings, readSettings } from "../platform/settings";
import { audit } from "../platform/audit";
import { consentMeta, recordedConsentVersion } from "../platform/consent";
import { ACCOUNT_CONSENT_KINDS, GUARDIAN_ACCOUNT_ERROR, type ConsentKind } from "@/lib/consent";
import { passwordPolicyError, type PasswordRole } from "@/lib/password-policy";
import { HASH_BUSY_MESSAGE, LOGIN_BUSY_MESSAGE } from "@/lib/busy";
import { count, W } from "@/lib/design";

/** منطق المصادقة (بدون اعتماد على سياق الطلب لسهولة الاختبار) */

export type AuthResult =
  | { ok: true; userId: string; token: string; expiresAt: Date; mustChangePassword?: boolean; needsTwoFactorEnrolment?: boolean; deviceProof?: string }
  /** challenge: كلمة المرور صحيحة لكن الدخول لم يكتمل. لا جلسة بعد، فتجاهله يعني فشل الدخول. busy: لم تُفحص كلمة المرور أصلًا */
  | { ok: false; error: string; retryAfter?: number; busy?: boolean; challenge?: { token: string; expiresAt: Date }; deviceProof?: string };

/**
 * حدود الدخول: تُحتسب الإخفاقات فقط، والدخول الناجح لا يُحتسب أبدًا.
 *
 *  - لكل زوج (حساب + IP): ٥ محاولات خاطئة بلا تأخير، ثم انتظار ٣٠ ثانية يتضاعف حتى ١٥ دقيقة.
 *    تُنسى بعد ساعة بلا محاولات، وتُمسح عند أول كلمة مرور صحيحة.
 *    المفتاح يجمع الاثنين عن قصد: مهاجم يعرف بريدك لا يستطيع قفله من شبكة أخرى.
 *    ومتصفح سبق أن دخل هذا الحساب (device-proof.ts) يُحتسب على عدّاده هو بالسياسة نفسها بدل الزوج (R004):
 *    زميل أو غريب على العنوان نفسه لا يقفله، وتخميناته هو تقفله وحده، ودخوله الصحيح لا يمسح عدّاد الزوج.
 *  - لكل حساب من كل الشبكات: ٢٠ محاولة بلا تأخير، ثم انتظار دقيقة يتضاعف حتى ٥ دقائق، أي ٢٨٨ تخمينًا في اليوم على الأكثر.
 *    تُنسى بعد ساعة بلا محاولات. يبطئ التخمين الموزع على عناوين كثيرة، ولا يقفل أحدًا طويلًا: ٥ دقائق بعد آخر محاولة،
 *    ومتصفح سبق أن دخل هذا الحساب (device-proof.ts) لا يقف عنده ولا يُحتسب عليه. الاستعادة بالرابط وإعادة التعيين من المالك تمسحانه.
 *  - لكل IP: ١٠٠ حساب مختلف فشل الدخول إليها خلال ١٥ دقيقة. يوقف تجربة كلمة واحدة على قائمة حسابات،
 *    ويُحتسب الحساب مرة واحدة، فأخطاء طلاب فصل كامل في كلماتهم لا تكاد تقترب منه.
 *    متصفح سبق أن أثبت كلمة مرور هذا الحساب لا يقف عند هذا الحظر (device-proof.ts). الكلمة الصحيحة وحدها لا تتجاوزه.
 *
 *  الحجز يسبق فحص كلمة المرور حتى لا تتجاوز طلبات متوازية الحد، ثم يُمسح إن كانت الكلمة صحيحة.
 *  يعتمد هذا على عنوان IP لا يزوّره العميل: انظر TRUST_PROXY و clientIp، وعلى Vercel تضبطه المنصة نفسها.
 */
const LOGIN_FAILURES: FailurePolicy = { freeFailures: 5, firstDelaySeconds: 30, maxDelaySeconds: 15 * 60, forgetAfterSeconds: 60 * 60 };
const LOGIN_ACCOUNT_CEILING: FailurePolicy = { freeFailures: 20, firstDelaySeconds: 60, maxDelaySeconds: 5 * 60, forgetAfterSeconds: 60 * 60 };
const LOGIN_IP = { failingAccounts: 100, windowSec: 15 * 60 };

/** جلسة تغيير كلمة المرور المؤقتة قصيرة، ولا تفتح أي صفحة أخرى */
const MUST_CHANGE_SESSION_MS = 60 * 60 * 1000;

export { loginFailurePrefix };

const ACCOUNT_SUSPENDED: AuthResult = { ok: false, error: "هذا الحساب موقوف. تواصل مع الدعم." };

function lockoutMessage(retryAfterSeconds: number) {
  const remaining = retryAfterSeconds < 60 ? "أقل من دقيقة" : count(Math.ceil(retryAfterSeconds / 60), W.minute);
  return `تم إيقاف تسجيل الدخول مؤقتًا بسبب محاولات خاطئة متكررة. المدة المتبقية: ${remaining}.${mailIsReal() ? " ويمكنك استعادة كلمة المرور إن نسيتها." : ""}`;
}

type LoginUser = { id: string; password_hash: string; role: PasswordRole; is_active: boolean; must_change_password: boolean; temp_password_expires_at: Date | null };
type LoginCheck = { outcome: "refused"; result: AuthResult } | { outcome: "wrong"; firstFailure: boolean } | { outcome: "correct"; user: LoginUser };

/** الجزء الذي يجري داخل دور التجزئة: حجز عدّادات الإخفاق، ثم الحساب، ثم عملية scrypt واحدة في كل طريق */
async function checkLoginPassword(email: string, password: string, failureKey: string, accountKey: string | null): Promise<LoginCheck> {
  // السلوك واحد لبريد مسجل وغير مسجل: لا تأخير ولا رسالة تكشف وجود الحساب
  const slot = await reserveFailureSlot(failureKey, LOGIN_FAILURES);
  if (!slot.allowed) return { outcome: "refused", result: { ok: false, error: lockoutMessage(slot.retryAfterSeconds), retryAfter: slot.retryAfterSeconds } };

  // بعد الزوج عن قصد: عنوان محجوب وحده لا يلمس عدّاد الحساب، فلا يطيل انتظار صاحبه من شبكة أخرى
  if (accountKey) {
    const ceiling = await reserveFailureSlot(accountKey, LOGIN_ACCOUNT_CEILING);
    if (!ceiling.allowed) {
      await releaseFailureSlot(failureKey);
      return { outcome: "refused", result: { ok: false, error: lockoutMessage(ceiling.retryAfterSeconds), retryAfter: ceiling.retryAfterSeconds } };
    }
  }

  const [user] = await sql<LoginUser[]>`
    select id, password_hash, role, is_active, must_change_password, temp_password_expires_at from users where email = ${email}
  `;
  const firstFailure = slot.failures === 1;
  if (!user) {
    await burnPasswordTime(password);
    return { outcome: "wrong", firstFailure };
  }
  return (await verifyPassword(password, user.password_hash)) ? { outcome: "correct", user } : { outcome: "wrong", firstFailure };
}

export async function loginWithPassword(email: string, password: string, meta: { ip: string; userAgent: string; deviceProof?: string }): Promise<AuthResult> {
  const provedDevice = verifyDeviceProof(meta.deviceProof, email, env().APP_SECRET);
  // كل المفاتيح تحت بادئة الحساب: الاستعادة وإعادة التعيين من المالك تمسحانها معًا. لا عنوان اسمه «*» ولا يبدأ بـ «dev:»
  const failureKey = provedDevice ? `${loginFailurePrefix(email)}dev:${deviceProofKey(meta.deviceProof!)}` : `${loginFailurePrefix(email)}${meta.ip}`;
  const accountKey = `${loginFailurePrefix(email)}*`;
  const ipKey = `login:ipfail:${meta.ip}`;
  if (!provedDevice) {
    const ipState = await peekRateLimit(ipKey, LOGIN_IP.failingAccounts);
    if (ipState.blocked) return { ok: false, error: "محاولات كثيرة. حاول مرة أخرى بعد قليل.", retryAfter: ipState.retryAfterSeconds };
  }

  // الدور قبل أي كتابة وقبل البحث عن الحساب: من يُرفض هنا لم يُفحص، فلا يُحتسب عليه ولا يختلف بين بريد مسجل وغير مسجل.
  // والمكان يعود فور انتهاء الفحص: فتح الجلسة والعدادات بعده لا تحجز دور طالب آخر
  let check: LoginCheck;
  try {
    check = await withHashSlot(() => checkLoginPassword(email, password, failureKey, provedDevice ? null : accountKey));
  } catch (err) {
    if (isHashBusy(err)) return { ok: false, error: LOGIN_BUSY_MESSAGE, retryAfter: HASH_BUSY_RETRY_AFTER_SECONDS, busy: true };
    throw err;
  }
  if (check.outcome === "refused") return check.result;
  if (check.outcome === "wrong") {
    if (check.firstFailure) await hitRateLimit(ipKey, LOGIN_IP.failingAccounts, LOGIN_IP.windowSec);
    return { ok: false, error: "البريد الإلكتروني أو كلمة المرور غير صحيحة." };
  }
  const { user } = check;

  // كلمة صحيحة: ليست إخفاقًا مهما كانت حالة الحساب بعدها
  await settleCorrectPassword(failureKey, provedDevice ? null : accountKey);
  if (!user.is_active) return ACCOUNT_SUSPENDED;
  const deviceProof = issueDeviceProof(email, env().APP_SECRET);

  // مدير فعّل التحقق بخطوتين: لا جلسة من كلمة المرور وحدها
  if (user.role === "admin" && (await twoFactorIsActive(user.id))) {
    const challenge = await startLoginChallenge(user.id);
    if (!challenge.ok) return challenge;
    return { ok: false, error: "أدخل رمز التحقق لإكمال الدخول.", challenge: { token: challenge.token, expiresAt: challenge.expiresAt }, deviceProof };
  }

  // معلم كلمته دون سياسة الطاقم، كطالب رُقّي قبل D17: كلمته صحيحة لكنها لا تفتح اللوحة قبل أن يختار كلمة تطابقها.
  // لا تاريخ انتهاء هنا: الكلمة ليست مؤقتة، وتبقى تفتح صفحة الاختيار وحدها حتى يغيّرها
  if (user.role === "teacher" && !user.must_change_password && passwordPolicyError("teacher", password, email)) {
    await sql.begin(async (tx) => {
      await tx`update users set must_change_password = true, temp_password_expires_at = null where id = ${user.id}`;
      await audit({ actorId: user.id, action: "user.password_below_staff_policy", entityType: "user", entityId: user.id, ip: meta.ip }, tx);
    });
    user.must_change_password = true;
    user.temp_password_expires_at = null;
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
  try {
    if (user.must_change_password) {
      const s = await createSession(user.id, meta, { ttlMs: MUST_CHANGE_SESSION_MS });
      return { ok: true, userId: user.id, token: s.token, expiresAt: s.expiresAt, mustChangePassword: true, deviceProof };
    }
    const s = await createSession(user.id, meta);
    // إلزامي وغير مسجَّل: الجلسة لا تفتح إلا صفحة التسجيل (انظر getCurrentUser)
    return { ok: true, userId: user.id, token: s.token, expiresAt: s.expiresAt, needsTwoFactorEnrolment: user.role === "admin" && adminTwoFactorRequired(), deviceProof };
  } catch (err) {
    // أُوقف الحساب بين فحص كلمة المرور وفتح الجلسة
    if (err instanceof InactiveAccountError) return ACCOUNT_SUSPENDED;
    throw err;
  }
}
/** الخطوة الثانية لدخول المدير. جلسة كلمة المرور المؤقتة تُحترم بعد الرمز كما قبله */
export async function completeTwoFactorLogin(token: string | undefined, code: unknown, meta: { ip: string; userAgent: string }): Promise<CompleteChallengeResult> {
  return completeLoginChallenge({ token, code, ip: meta.ip, userAgent: meta.userAgent, mustChangeTtlMs: MUST_CHANGE_SESSION_MS });
}

/** userId فارغ يعني أن البريد مسجل من قبل. يبقى هذا داخل الخادم: الجواب الذي يصل الزائر واحد في الحالتين */
export type RegisterResult = { ok: true; userId: string | null } | { ok: false; error: string; field?: "password" };

/**
 * إنشاء حساب طالب. لا يكشف هل البريد مسجل (K029): الخطوات نفسها في الحالتين (تجزئة كلمة المرور ثم أمر واحد)،
 * ولا جلسة ولا كوكي ولا رسالة تختلف، فالدخول خطوة تالية بكلمة المرور كأي دخول.
 * الحساب وموافقاته في أمر SQL واحد: لا حساب بلا ما وافق عليه، ولا موافقة بلا حساب أنشأه هذا الطلب.
 */
export async function registerStudent(
  input: { fullName: string; email: string; password: string; phone: string | null; gradeId?: string; acceptedDocuments: boolean; acceptedGuardian: boolean },
  meta: { ip: string; userAgent: string },
): Promise<RegisterResult> {
  if (!input.acceptedDocuments) return { ok: false, error: "يجب الموافقة على الشروط والأحكام وسياسة الخصوصية." };
  if (!input.acceptedGuardian) return { ok: false, error: GUARDIAN_ACCOUNT_ERROR };
  const problem = passwordPolicyError("student", input.password, input.email);
  if (problem) return { ok: false, error: problem, field: "password" };
  // عنوان واحد قد يكون مدرسة كاملة: الحد يوقف الإغراق ولا يوقف صفًا يسجّل معًا
  // الحد داخل الدور: من يُرفض لانشغال المنصة لا يُحتسب على شبكته
  let hash: string | null;
  try {
    hash = await withHashSlot(async () => {
      const limit = await hitRateLimit(`register:ip:${meta.ip}`, 200, 60 * 60);
      return limit.allowed ? hashPassword(input.password) : null;
    });
  } catch (err) {
    if (isHashBusy(err)) return { ok: false, error: HASH_BUSY_MESSAGE };
    throw err;
  }
  if (hash === null) return { ok: false, error: "محاولات تسجيل كثيرة من هذه الشبكة. حاول لاحقًا." };
  const [settings, grades] = await Promise.all([readSettings(), input.gradeId ? sql<{ id: string }[]>`select id from grades where id = ${input.gradeId} and is_published` : Promise.resolve([] as { id: string }[])]);
  const kinds: ConsentKind[] = [...ACCOUNT_CONSENT_KINDS, "guardian_account"];
  const versions = kinds.map((kind) => recordedConsentVersion(kind, settings));
  const consent = consentMeta(meta);
  const [created] = await sql<{ id: string }[]>`
    with created as (
      insert into users (email, password_hash, full_name, phone, grade_id, role)
      values (${input.email}, ${hash}, ${input.fullName}, ${input.phone}, ${grades[0]?.id ?? null}, 'student')
      on conflict (email) do nothing
      returning id
    ), consents as (
      insert into consent_records (user_id, kind, document_version, ip, user_agent)
      select created.id, signed.kind, signed.version, ${consent.ip}::text, ${consent.userAgent}::text
      from created cross join unnest(${kinds}::text[], ${versions}::text[]) as signed(kind, version)
    )
    select id from created
  `;
  return { ok: true, userId: created?.id ?? null };
}

/**
 * الأضيق أولًا بعد الشبكة: ٣ لكل زوج (حساب + IP)، فلا يستطيع من يعرف بريدك استهلاك حد حسابك من عنوان واحد.
 * حد الشبكة يعدّ الحسابات لا الطلبات، فصف نسي طلابه كلماتهم معًا وأعادوا الطلب لا يصل إليه.
 */
const RESET_LIMITS = { perIp: 100, perPair: 3, perAccount: 20, windowSec: 60 * 60 };

/** مدة رابط الاستعادة الذي يطلبه الطالب لنفسه. سياسة الخصوصية ورسالة البريد تقرآن الرقم من هنا */
export const PASSWORD_RESET_LINK_HOURS = 1;

/**
 * طلب استعادة كلمة المرور — الرد موحد دائمًا (لا نكشف وجود الحساب).
 * حساب المدير لا يستعيد عبر البريد (انظر سياسة password-policy): يصله تنبيه بلا رابط.
 * الطلب الجديد لا يبطل الروابط السابقة: طلبات الغرباء لا تبطل رابطًا وصل إلى الطالب، واستخدام أي رابط يبطلها كلها.
 */
export async function requestPasswordReset(email: string, ip: string): Promise<void> {
  // ما تجاوز حد الشبكة لا يُحتسب على الحساب، فلا يستهلك مهاجم من عنوان محجوب حد ضحيته
  const ipKey = `reset:ip:${ip}`;
  const ipState = await peekRateLimit(ipKey, RESET_LIMITS.perIp);
  if (ipState.blocked) return;
  const pairLimit = await hitRateLimit(`reset:acct:${email}|${ip}`, RESET_LIMITS.perPair, RESET_LIMITS.windowSec);
  if (!pairLimit.allowed) return;
  if (pairLimit.remaining === RESET_LIMITS.perPair - 1) {
    const ipLimit = await hitRateLimit(ipKey, RESET_LIMITS.perIp, RESET_LIMITS.windowSec);
    if (!ipLimit.allowed) return;
  }
  const acctLimit = await hitRateLimit(`reset:acct:${email}`, RESET_LIMITS.perAccount, RESET_LIMITS.windowSec);
  if (!acctLimit.allowed) return;
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
      text: `وصلنا طلب لاستعادة كلمة مرور هذا الحساب الإداري. حسابات الإدارة لا تُستعاد عبر البريد، فلم يتغير شيء.\n\nإذا كنت أنت من طلب ذلك: تُستعاد كلمة المرور بأمر admin:create من جهازك باستخدام رابط قاعدة البيانات، والخطوات في دليل التشغيل README.\n\nإذا لم تطلب ذلك فقد يكون أحدهم يحاول الوصول إلى الحساب.\n\n${settings.site_name}`,
    });
    return;
  }
  const token = generateToken();
  const tokenId = hashToken(token);
  await sql`
    insert into password_reset_tokens (id, user_id, expires_at)
    values (${tokenId}, ${user.id}, now() + make_interval(hours => ${PASSWORD_RESET_LINK_HOURS}))
  `;
  const link = `${env().APP_URL.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}`;
  const sent = await sendMail({
    to: email,
    template: "password_reset",
    subject: `استعادة كلمة المرور، ${settings.site_name}`,
    text: `مرحبًا ${user.full_name}،\n\nوصلنا طلب لاستعادة كلمة المرور لحسابك. افتح الرابط التالي خلال ${count(PASSWORD_RESET_LINK_HOURS, W.hour)} لتعيين كلمة مرور جديدة:\n${link}\n\nإذا لم تطلب ذلك، تجاهل هذه الرسالة وسيبقى حسابك آمنًا.\n\n${settings.site_name}`,
  });
  // رابط لم يخرج لا يبقى صالحًا في قاعدة البيانات
  if (!sent) await sql`delete from password_reset_tokens where id = ${tokenId}`;
}

export async function resetPassword(token: string, newPassword: string): Promise<{ ok: true } | { ok: false; error: string; field?: "password" }> {
  if (!token || token.length > 100) return { ok: false, error: "الرابط غير صالح." };
  const id = hashToken(token);
  type TokenRow = { user_id: string; expires_at: Date; used_at: Date | null; role: PasswordRole; email: string };
  const expired = { ok: false as const, error: "انتهت صلاحية الرابط أو سبق استخدامه. اطلب رابطًا جديدًا." };
  const usable = (row: TokenRow | undefined): row is TokenRow => row !== undefined && !row.used_at && new Date(row.expires_at).getTime() >= Date.now() && row.role !== "admin";
  const [seen] = await sql<TokenRow[]>`
    select t.user_id, t.expires_at, t.used_at, u.role, u.email
    from password_reset_tokens t join users u on u.id = t.user_id
    where t.id = ${id}
  `;
  if (!usable(seen)) return expired;
  // الرفض قبل استهلاك الرمز: الطالب يصحح كلمته بالرابط نفسه
  const early = passwordPolicyError(seen.role, newPassword, seen.email);
  if (early) return { ok: false, error: early, field: "password" };
  // التجزئة قبل المعاملة: قد تنتظر دورها ثوانٍ، ولا يصح أن تمسك خلالها قفلًا واتصالًا
  let hash: string;
  try {
    hash = await hashPassword(newPassword);
  } catch (err) {
    if (isHashBusy(err)) return { ok: false, error: HASH_BUSY_MESSAGE };
    throw err;
  }
  return sql.begin(async (tx) => {
    // القفل ثم التحقق من جديد: الرابط يصلح مرة واحدة مهما تزامنت الطلبات أثناء التجزئة
    const [row] = await tx<TokenRow[]>`
      select t.user_id, t.expires_at, t.used_at, u.role, u.email
      from password_reset_tokens t join users u on u.id = t.user_id
      where t.id = ${id} for update of t
    `;
    if (!usable(row)) return expired;
    const problem = passwordPolicyError(row.role, newPassword, row.email);
    if (problem) return { ok: false as const, error: problem, field: "password" as const };
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

/** field غائب: رفض بلا فحص لأن المنصة مشغولة */
export type ChangePasswordResult = { ok: true } | { ok: false; error: string; field?: "currentPassword" | "newPassword" };

export async function changePassword(userId: string, current: string, next: string, keepSessionId: string): Promise<ChangePasswordResult> {
  const key = `pwchange:fail:${userId}`;
  try {
    const check = await withHashSlot(async () => {
      const slot = await reserveFailureSlot(key, CHANGE_PASSWORD_FAILURES);
      if (!slot.allowed) return "limited" as const;
      const [u] = await sql<{ password_hash: string; role: PasswordRole; email: string }[]>`select password_hash, role, email from users where id = ${userId}`;
      return u && (await verifyPassword(current, u.password_hash)) ? u : ("wrong" as const);
    });
    if (check === "limited") return { ok: false, error: "محاولات كثيرة. حاول مرة أخرى بعد قليل.", field: "currentPassword" };
    if (check === "wrong") return { ok: false, error: "كلمة المرور الحالية غير صحيحة.", field: "currentPassword" };
    await clearRateLimit(key);
    const problem = passwordPolicyError(check.role, next, check.email);
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
  } catch (err) {
    if (isHashBusy(err)) return { ok: false, error: HASH_BUSY_MESSAGE };
    throw err;
  }
}

export type ForcedChangeResult = { ok: true; token: string; expiresAt: Date } | { ok: false; error: string; field?: "password" };

/**
 * إنهاء كلمة المرور المؤقتة: تعيين كلمة الطالب الخاصة، إلغاء كل الجلسات والروابط، ثم جلسة كاملة جديدة.
 * من يصل هنا أثبت نفسه بالكلمة المؤقتة خلال الساعة الماضية، فلا نطلبها مرة أخرى.
 * الجلسة الجديدة ترث ختم العامل الثاني من الجلسة التي غيّرت الكلمة: حساب فعّل التحقق لا تعمل له جلسة بلا ختم،
 * فبدون ذلك يعود صاحبه إلى الدخول مباشرة بعد أن اختار كلمته.
 */
export async function completeForcedPasswordChange(userId: string, next: string, meta: { ip: string; userAgent: string; sessionId?: string }): Promise<ForcedChangeResult> {
  let hash: string;
  try {
    const refused = await withHashSlot(async (): Promise<ForcedChangeResult | null> => {
      const limit = await hitRateLimit(`pwforced:user:${userId}`, 20, 15 * 60);
      if (!limit.allowed) return { ok: false, error: "محاولات كثيرة. حاول مرة أخرى بعد قليل." };
      const [u] = await sql<{ password_hash: string; role: PasswordRole; email: string; must_change_password: boolean }[]>`
        select password_hash, role, email, must_change_password from users where id = ${userId}
      `;
      if (!u?.must_change_password) return { ok: false, error: "لا يلزم تغيير كلمة المرور لهذا الحساب." };
      const problem = passwordPolicyError(u.role, next, u.email);
      if (problem) return { ok: false, error: problem, field: "password" };
      if (await verifyPassword(next, u.password_hash)) return { ok: false, error: "اختر كلمة مرور غير الكلمة المؤقتة.", field: "password" };
      return null;
    });
    if (refused) return refused;
    hash = await hashPassword(next);
  } catch (err) {
    if (isHashBusy(err)) return { ok: false, error: HASH_BUSY_MESSAGE };
    throw err;
  }
  const session = await sql.begin(async (tx) => {
    const updated = await tx`
      update users set password_hash = ${hash}, must_change_password = false, temp_password_expires_at = null
      where id = ${userId} and must_change_password returning id
    `;
    if (updated.length === 0) return null;
    const [current] = await tx<{ two_factor_at: Date | null; two_factor_method: SecondFactorMethod | null }[]>`
      select two_factor_at, two_factor_method from sessions where id = ${meta.sessionId ?? ""} and user_id = ${userId}
    `;
    await tx`update password_reset_tokens set used_at = now() where user_id = ${userId} and used_at is null`;
    await revokeEmailLinks(tx, userId);
    await tx`delete from sessions where user_id = ${userId}`;
    await audit({ actorId: userId, action: "user.temporary_password_replaced", entityType: "user", entityId: userId, ip: meta.ip }, tx);
    return createSessionIn(tx, userId, { ip: meta.ip, userAgent: meta.userAgent }, { twoFactorVerified: Boolean(current?.two_factor_at), twoFactorMethod: current?.two_factor_method ?? null });
  });
  if (!session) return { ok: false, error: "لا يلزم تغيير كلمة المرور لهذا الحساب." };
  return { ok: true, token: session.token, expiresAt: session.expiresAt };
}
