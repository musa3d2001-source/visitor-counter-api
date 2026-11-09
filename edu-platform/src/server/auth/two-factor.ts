import "server-only";
import { sql, type Db } from "../db";
import { adminTwoFactorRequired, env } from "../env";
import { audit } from "../platform/audit";
import { count, W } from "@/lib/design";
import { clearRateLimit, hitRateLimit, reserveFailureSlot, type FailurePolicy } from "./rate-limit";
import { createSessionIn, generateToken, hashToken } from "./session";
import {
  base32Encode,
  constantTimeEqual,
  generateRecoveryCodes,
  generateTotpSecret,
  groupForDisplay,
  hashRecoveryCode,
  matchTotpStep,
  openTotpSecret,
  otpauthUri,
  parseSecondFactorCode,
  sealTotpSecret,
  type SecondFactorInput,
} from "./two-factor-core";

/**
 * التحقق بخطوتين لحسابات الإدارة.
 *
 * كل طريق يفحص رمزًا (إكمال الدخول، خطوة الاسترداد، إدارة الرموز، إيقاف الميزة) يمر بالعدّاد نفسه لكل حساب:
 * ٥ أخطاء بلا تأخير ثم انتظار ٣٠ ثانية يتضاعف حتى ١٥ دقيقة. المفتاح الحساب وحده لا الحساب مع IP،
 * لأن من يعرف كلمة المرور يبدّل عنوانه بسهولة، ورمز من ٦ أرقام لا يحتمل تخمينًا موزعًا.
 * والخطأ لا يُنسى إلا بعد يوم بلا محاولات.
 */
const CODE_FAILURES: FailurePolicy = { freeFailures: 5, firstDelaySeconds: 30, maxDelaySeconds: 15 * 60, forgetAfterSeconds: 24 * 60 * 60 };

const CHALLENGE_MINUTES = 5;
const CHALLENGE_MAX_ATTEMPTS = 5;
/** بداية خطوة كلمة المرور الناجحة، بكلمة صحيحة فقط، وتحد من ملء الجدول */
const CHALLENGE_STARTS = { limit: 20, windowSec: 15 * 60 };
/** طلبات خطوة الرمز على تحدٍّ حي، أي بعد كلمة مرور صحيحة */
const STEP_TWO_IP = { limit: 60, windowSec: 15 * 60 };
/** تحديات غير موجودة أو منتهية. عداد منفصل، فلا يوقف عابث من شبكة المدرسة مديرًا عرف كلمته */
const STEP_TWO_BAD_TOKEN_IP = { limit: 60, windowSec: 15 * 60 };
/** السر الذي لم يؤكَّد لا يبقى طويلًا */
const PENDING_MINUTES = 30;

const INVALID_CODE = "الرمز غير صحيح أو سبق استخدامه. انتظر الرمز التالي في التطبيق ثم حاول مرة أخرى.";
const MALFORMED_CODE = "أدخل الرمز المكوّن من ٦ أرقام من تطبيق المصادقة، أو أحد رموز الاسترداد.";
const CHALLENGE_EXPIRED = "انتهت مهلة هذه الخطوة. سجّل دخولك من جديد.";

type CodeContext = { ip?: string | null; purpose: "login" | "step_up" | "manage" };
type Refused = { ok: false; error: string; retryAfter?: number };

function failureKey(userId: string) {
  return `2fa:fail:${userId}`;
}

function waitMessage(seconds: number) {
  const remaining = seconds < 60 ? "أقل من دقيقة" : count(Math.ceil(seconds / 60), W.minute);
  return `محاولات كثيرة. حاول مرة أخرى بعد: ${remaining}.`;
}

function appSecret() {
  return env().APP_SECRET;
}

export type TwoFactorStatus = { enabled: boolean; enabledAt: Date | null; recoveryRemaining: number; required: boolean };

export async function getTwoFactorStatus(userId: string): Promise<TwoFactorStatus> {
  const [row] = await sql<{ enabled_at: Date | null; remaining: number }[]>`
    select t.enabled_at,
      (select count(*)::int from user_recovery_codes r where r.user_id = ${userId} and r.used_at is null) as remaining
    from user_totp t where t.user_id = ${userId} and t.enabled_at is not null
  `;
  return { enabled: Boolean(row), enabledAt: row?.enabled_at ?? null, recoveryRemaining: row?.remaining ?? 0, required: adminTwoFactorRequired() };
}

export async function twoFactorIsActive(userId: string): Promise<boolean> {
  const [row] = await sql`select 1 from user_totp where user_id = ${userId} and enabled_at is not null`;
  return Boolean(row);
}

/**
 * يستهلك الرمز ذريًا داخل المعاملة، ويعيد طريقة التحقق أو null.
 *  - TOTP: يقبل خطوة أكبر من آخر خطوة مقبولة فقط. طلبان بالرمز نفسه: تحديث واحد ينجح.
 *  - رمز الاسترداد: المقارنة على كل الرموز المتبقية بزمن ثابت، ثم تحديث مشروط بأنه لم يُستخدم.
 */
async function consumeSecondFactor(tx: Db, userId: string, input: SecondFactorInput, ctx: CodeContext): Promise<"totp" | "recovery" | null> {
  if (input.kind === "totp") {
    const [row] = await tx<{ secret_ciphertext: string }[]>`select secret_ciphertext from user_totp where user_id = ${userId} and enabled_at is not null`;
    if (!row) return null;
    let secret: Buffer;
    try {
      secret = openTotpSecret(row.secret_ciphertext, appSecret(), userId);
    } catch {
      // يحدث بعد تغيير APP_SECRET. لا نكتب شيئًا عن السر، والحل scripts/reset-admin-2fa.ts
      console.error("[2fa] stored secret could not be decrypted");
      return null;
    }
    const step = matchTotpStep(secret, input.code, Date.now());
    if (step === null) return null;
    const claimed = await tx`
      update user_totp set last_used_step = ${step}
      where user_id = ${userId} and enabled_at is not null and (last_used_step is null or last_used_step < ${step})
      returning user_id
    `;
    return claimed.length ? "totp" : null;
  }

  const rows = await tx<{ id: string; code_hash: string }[]>`select id, code_hash from user_recovery_codes where user_id = ${userId} and used_at is null`;
  const wanted = hashRecoveryCode(input.code, appSecret(), userId);
  let matchedId: string | null = null;
  for (const row of rows) if (constantTimeEqual(row.code_hash, wanted)) matchedId = row.id;
  if (!matchedId) return null;
  const consumed = await tx`update user_recovery_codes set used_at = now() where id = ${matchedId} and used_at is null returning id`;
  if (!consumed.length) return null;
  await audit({ actorId: userId, action: "two_factor.recovery_code_used", entityType: "user", entityId: userId, metadata: { purpose: ctx.purpose, remaining: rows.length - 1 }, ip: ctx.ip ?? null }, tx);
  return "recovery";
}

/** يفحص الرمز تحت العدّاد، ثم ينفذ العمل في معاملة الاستهلاك نفسها: فشل العمل لا يحرق الرمز */
async function withVerifiedCode<T>(userId: string, rawCode: unknown, ctx: CodeContext, work: (tx: Db, method: "totp" | "recovery") => Promise<T>): Promise<{ ok: true; method: "totp" | "recovery"; value: T } | Refused> {
  const parsed = parseSecondFactorCode(rawCode);
  if (!parsed) return { ok: false, error: MALFORMED_CODE };
  const key = failureKey(userId);
  const slot = await reserveFailureSlot(key, CODE_FAILURES);
  if (!slot.allowed) return { ok: false, error: waitMessage(slot.retryAfterSeconds), retryAfter: slot.retryAfterSeconds };
  const outcome = await sql.begin(async (tx) => {
    const method = await consumeSecondFactor(tx, userId, parsed, ctx);
    if (!method) return null;
    return { method, value: await work(tx, method) };
  });
  if (!outcome) return { ok: false, error: INVALID_CODE };
  await clearRateLimit(key);
  return { ok: true, method: outcome.method, value: outcome.value };
}

async function storeRecoveryCodes(tx: Db, userId: string, codes: string[]) {
  const hashes = codes.map((code) => hashRecoveryCode(parseSecondFactorCode(code)!.code, appSecret(), userId));
  await tx`delete from user_recovery_codes where user_id = ${userId}`;
  await tx`insert into user_recovery_codes (user_id, code_hash) select ${userId}::uuid, unnest(${hashes}::text[])`;
}

export type EnrolmentDetails = { manualKey: string; otpauthUri: string };

/**
 * يبدأ التسجيل أو يكمله: السر مرتبط بالجلسة التي فتحته. فتح الصفحة من جلسة أخرى يولّد سرًا جديدًا،
 * فمن عرف كلمة المرور فقط لا يقرأ سر صاحب الحساب الذي يسجّله الآن.
 * null = التحقق بخطوتين مفعّل فعلًا.
 */
export async function beginTwoFactorEnrolment(input: { userId: string; sessionId: string; account: string; issuer: string }): Promise<EnrolmentDetails | null> {
  const [existing] = await sql<{ secret_ciphertext: string; enabled_at: Date | null; pending_session_id: string | null; fresh: boolean }[]>`
    select secret_ciphertext, enabled_at, pending_session_id, created_at > now() - make_interval(mins => ${PENDING_MINUTES}) as fresh
    from user_totp where user_id = ${input.userId}
  `;
  if (existing?.enabled_at) return null;

  let secret: Buffer | null = null;
  if (existing && existing.fresh && existing.pending_session_id === input.sessionId) {
    try {
      secret = openTotpSecret(existing.secret_ciphertext, appSecret(), input.userId);
    } catch {
      secret = null;
    }
  }
  if (!secret) {
    secret = generateTotpSecret();
    const sealed = sealTotpSecret(secret, appSecret(), input.userId);
    const [saved] = await sql`
      insert into user_totp (user_id, secret_ciphertext, pending_session_id)
      values (${input.userId}, ${sealed}, ${input.sessionId})
      on conflict (user_id) do update set secret_ciphertext = excluded.secret_ciphertext, pending_session_id = excluded.pending_session_id, last_used_step = null, created_at = now()
      where user_totp.enabled_at is null
      returning user_id
    `;
    if (!saved) return null;
  }
  const secretBase32 = base32Encode(secret);
  return { manualKey: groupForDisplay(secretBase32), otpauthUri: otpauthUri({ issuer: input.issuer, account: input.account, secretBase32 }) };
}

export type ConfirmEnrolmentResult = { ok: true; recoveryCodes: string[] } | Refused;

/** يتطلب رمزًا صحيحًا من السر الجديد قبل التفعيل. التفعيل يُنهي كل جلسة أخرى ويختم هذه الجلسة بأنها اجتازت العامل الثاني */
export async function confirmTwoFactorEnrolment(input: { userId: string; sessionId: string; code: unknown; ip?: string | null }): Promise<ConfirmEnrolmentResult> {
  const parsed = parseSecondFactorCode(input.code);
  if (parsed?.kind !== "totp") return { ok: false, error: "أدخل الرمز المكوّن من ٦ أرقام الظاهر في تطبيق المصادقة." };
  const key = failureKey(input.userId);
  const slot = await reserveFailureSlot(key, CODE_FAILURES);
  if (!slot.allowed) return { ok: false, error: waitMessage(slot.retryAfterSeconds), retryAfter: slot.retryAfterSeconds };
  const recoveryCodes = generateRecoveryCodes();

  const state = await sql.begin(async (tx): Promise<"ok" | "stale" | "invalid" | "already"> => {
    const [row] = await tx<{ secret_ciphertext: string; enabled_at: Date | null; pending_session_id: string | null; fresh: boolean }[]>`
      select secret_ciphertext, enabled_at, pending_session_id, created_at > now() - make_interval(mins => ${PENDING_MINUTES}) as fresh
      from user_totp where user_id = ${input.userId} for update
    `;
    if (row?.enabled_at) return "already";
    if (!row || !row.fresh || row.pending_session_id !== input.sessionId) return "stale";
    let secret: Buffer;
    try {
      secret = openTotpSecret(row.secret_ciphertext, appSecret(), input.userId);
    } catch {
      return "stale";
    }
    const step = matchTotpStep(secret, parsed.code, Date.now());
    if (step === null) return "invalid";
    await tx`update user_totp set enabled_at = now(), last_used_step = ${step}, pending_session_id = null where user_id = ${input.userId}`;
    await storeRecoveryCodes(tx, input.userId, recoveryCodes);
    await tx`delete from sessions where user_id = ${input.userId} and id <> ${input.sessionId}`;
    await tx`update sessions set two_factor_at = now() where id = ${input.sessionId}`;
    await tx`delete from login_challenges where user_id = ${input.userId}`;
    await audit({ actorId: input.userId, action: "two_factor.enabled", entityType: "user", entityId: input.userId, ip: input.ip ?? null }, tx);
    return "ok";
  });

  if (state === "already") return { ok: false, error: "التحقق بخطوتين مفعّل بالفعل على هذا الحساب." };
  if (state === "stale") return { ok: false, error: "انتهت مهلة هذا الرمز التعريفي. حدّث الصفحة وامسح الرمز الجديد." };
  if (state === "invalid") return { ok: false, error: INVALID_CODE };
  await clearRateLimit(key);
  return { ok: true, recoveryCodes };
}

/** رموز جديدة بدل كل القديمة، بعد رمز صحيح. تعاد مرة واحدة ولا تُخزَّن خامًا */
export async function regenerateRecoveryCodes(input: { userId: string; code: unknown; ip?: string | null }): Promise<{ ok: true; recoveryCodes: string[] } | Refused> {
  const recoveryCodes = generateRecoveryCodes();
  const out = await withVerifiedCode(input.userId, input.code, { ip: input.ip, purpose: "manage" }, async (tx, method) => {
    await storeRecoveryCodes(tx, input.userId, recoveryCodes);
    await audit({ actorId: input.userId, action: "two_factor.recovery_codes_regenerated", entityType: "user", entityId: input.userId, metadata: { method }, ip: input.ip ?? null }, tx);
  });
  return out.ok ? { ok: true, recoveryCodes } : out;
}

/** إيقاف التحقق بخطوتين بعد رمز صحيح. تبقى هذه الجلسة وتنتهي كل جلسة أخرى */
export async function disableTwoFactor(input: { userId: string; sessionId: string; code: unknown; ip?: string | null }): Promise<{ ok: true } | Refused> {
  const out = await withVerifiedCode(input.userId, input.code, { ip: input.ip, purpose: "manage" }, async (tx, method) => {
    await tx`delete from user_totp where user_id = ${input.userId}`;
    await tx`delete from user_recovery_codes where user_id = ${input.userId}`;
    await tx`delete from login_challenges where user_id = ${input.userId}`;
    await tx`delete from sessions where user_id = ${input.userId} and id <> ${input.sessionId}`;
    await audit({ actorId: input.userId, action: "two_factor.disabled", entityType: "user", entityId: input.userId, metadata: { method }, ip: input.ip ?? null }, tx);
  });
  return out.ok ? { ok: true } : out;
}

/** رمز جديد لأمر حساس: الرمز نفسه لا يصلح مرتين، ولو سبق استخدامه للدخول قبل ثوانٍ */
export async function verifyStepUpCode(input: { userId: string; code: unknown; ip?: string | null }): Promise<{ ok: true; method: "totp" | "recovery" } | Refused> {
  const out = await withVerifiedCode(input.userId, input.code, { ip: input.ip, purpose: "step_up" }, async () => undefined);
  return out.ok ? { ok: true, method: out.method } : out;
}

export type StartChallengeResult = { ok: true; token: string; expiresAt: Date } | Refused;

/**
 * خطوة كلمة المرور الناجحة لحساب فعّل التحقق بخطوتين: لا جلسة، بل تحدٍّ قصير العمر مرتبط بالحساب.
 * يبقى تحدٍّ واحد للحساب، ويُخزَّن SHA-256 للرمز فقط.
 */
export async function startLoginChallenge(userId: string): Promise<StartChallengeResult> {
  const limit = await hitRateLimit(`2fa:start:${userId}`, CHALLENGE_STARTS.limit, CHALLENGE_STARTS.windowSec);
  if (!limit.allowed) return { ok: false, error: waitMessage(limit.retryAfterSeconds), retryAfter: limit.retryAfterSeconds };
  const token = generateToken();
  const expiresAt = new Date(Date.now() + CHALLENGE_MINUTES * 60_000);
  await sql.begin(async (tx) => {
    await tx`delete from login_challenges where user_id = ${userId} or expires_at <= now()`;
    await tx`insert into login_challenges (id, user_id, expires_at) values (${hashToken(token)}, ${userId}, ${expiresAt})`;
  });
  return { ok: true, token, expiresAt };
}

export async function loginChallengeIsLive(token: string | undefined): Promise<boolean> {
  if (!token || token.length > 100) return false;
  const [row] = await sql`select 1 from login_challenges where id = ${hashToken(token)} and expires_at > now()`;
  return Boolean(row);
}

export type CompleteChallengeResult = { ok: true; token: string; expiresAt: Date; mustChangePassword: boolean } | (Refused & { expired?: boolean });

/**
 * إكمال الدخول. قفل صف التحدي يجعل طلبين متزامنين بالتحدي نفسه تسلسليين:
 * الثاني لا يجد تحديًا، فلا يستهلك رمزًا ولا يفتح جلسة ثانية.
 */
export async function completeLoginChallenge(input: { token: string | undefined; code: unknown; ip: string; userAgent: string; mustChangeTtlMs: number }): Promise<CompleteChallengeResult> {
  const badToken = async (): Promise<CompleteChallengeResult> => {
    const limit = await hitRateLimit(`2fa:badtoken:${input.ip}`, STEP_TWO_BAD_TOKEN_IP.limit, STEP_TWO_BAD_TOKEN_IP.windowSec);
    return limit.allowed ? { ok: false, error: CHALLENGE_EXPIRED, expired: true } : { ok: false, error: waitMessage(limit.retryAfterSeconds), retryAfter: limit.retryAfterSeconds };
  };
  if (!input.token || input.token.length > 100) return badToken();
  const id = hashToken(input.token);
  const [pending] = await sql<{ user_id: string }[]>`select user_id from login_challenges where id = ${id} and expires_at > now()`;
  if (!pending) return badToken();
  const limit = await hitRateLimit(`2fa:ip:${input.ip}`, STEP_TWO_IP.limit, STEP_TWO_IP.windowSec);
  if (!limit.allowed) return { ok: false, error: waitMessage(limit.retryAfterSeconds), retryAfter: limit.retryAfterSeconds };
  const parsed = parseSecondFactorCode(input.code);
  if (!parsed) return { ok: false, error: MALFORMED_CODE };

  const key = failureKey(pending.user_id);
  const slot = await reserveFailureSlot(key, CODE_FAILURES);
  if (!slot.allowed) return { ok: false, error: waitMessage(slot.retryAfterSeconds), retryAfter: slot.retryAfterSeconds };

  const outcome = await sql.begin(async (tx) => {
    const [row] = await tx<{ user_id: string; attempts: number; live: boolean; is_active: boolean; must_change_password: boolean }[]>`
      select c.user_id, c.attempts, c.expires_at > now() as live, u.is_active, u.must_change_password
      from login_challenges c join users u on u.id = c.user_id
      where c.id = ${id} for update of c
    `;
    if (!row || !row.live || !row.is_active || row.attempts >= CHALLENGE_MAX_ATTEMPTS) {
      await tx`delete from login_challenges where id = ${id}`;
      return { state: "expired" as const };
    }
    const method = await consumeSecondFactor(tx, row.user_id, parsed, { ip: input.ip, purpose: "login" });
    if (!method) {
      const attempts = row.attempts + 1;
      if (attempts >= CHALLENGE_MAX_ATTEMPTS) {
        await tx`delete from login_challenges where id = ${id}`;
        return { state: "expired" as const };
      }
      await tx`update login_challenges set attempts = ${attempts} where id = ${id}`;
      return { state: "invalid" as const };
    }
    await tx`delete from login_challenges where id = ${id}`;
    const session = await createSessionIn(tx, row.user_id, { ip: input.ip, userAgent: input.userAgent }, { twoFactorVerified: true, ttlMs: row.must_change_password ? input.mustChangeTtlMs : undefined });
    return { state: "ok" as const, session, mustChangePassword: row.must_change_password };
  });

  if (outcome.state === "expired") return { ok: false, error: CHALLENGE_EXPIRED, expired: true };
  if (outcome.state === "invalid") return { ok: false, error: INVALID_CODE };
  await clearRateLimit(key);
  return { ok: true, token: outcome.session.token, expiresAt: outcome.session.expiresAt, mustChangePassword: outcome.mustChangePassword };
}
