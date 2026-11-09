import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { adminTwoFactorRequired, resetEnvCache } from "@/server/env";
import { changePassword, completeTwoFactorLogin, loginWithPassword } from "@/server/auth/service";
import { ADMIN_SESSION_MS, createSession, hashToken, SESSION_COOKIE, validateSessionToken } from "@/server/auth/session";
import {
  beginTwoFactorEnrolment,
  confirmTwoFactorEnrolment,
  disableTwoFactor,
  getTwoFactorStatus,
  loginChallengeIsLive,
  regenerateRecoveryCodes,
  startLoginChallenge,
  verifyStepUpCode,
} from "@/server/auth/two-factor";
import { base32Decode, base32Encode, hashRecoveryCode, openTotpSecret, parseSecondFactorCode, timeStep } from "@/server/auth/two-factor-core";
import { closeDb, resetDb, sql } from "../helpers/db";
import { createUser, TEST_PASSWORD } from "../helpers/factories";
import { codeAt, currentStep, enrolAdmin, freshCode, wrongCode } from "../helpers/two-factor";
import { TEST_ENV } from "../test-env";

/** كوكيات حقيقية عبر الجرة: هذه الاختبارات تفحص البوابة نفسها، فلا نستبدل getCurrentUser */
const ctx = vi.hoisted(() => ({ jar: new Map<string, string>(), options: new Map<string, Record<string, unknown>>() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (ctx.jar.has(name) ? { value: ctx.jar.get(name) } : undefined),
    set: (name: string, value: string, options: Record<string, unknown>) => {
      ctx.options.set(name, options);
      if (!value || options?.maxAge === 0) ctx.jar.delete(name);
      else ctx.jar.set(name, value);
    },
  }),
  headers: async () => new Headers({ "x-pathname": "/admin", "x-forwarded-for": "192.0.2.77", "user-agent": "vitest" }),
}));
vi.mock("next/navigation", async (original) => ({
  ...(await original<typeof import("next/navigation")>()),
  // بصمة التوجيه الحقيقية: adminAction يميّزها عن الأخطاء العادية ويعيد رميها
  redirect: (url: string) => {
    throw Object.assign(new Error(`NEXT_REDIRECT ${url}`), { digest: `NEXT_REDIRECT;replace;${url};307;` });
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ refresh() {} }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { getCurrentUser } = await import("@/server/auth/session");
const { requireUser } = await import("@/server/auth/guards");
const { requireStaff } = await import("@/server/auth/permissions");
const { loginAction } = await import("@/app/(site)/(auth)/actions");
const { confirmTwoFactorSetupAction, verifyLoginCodeAction } = await import("@/app/(site)/(auth)/two-factor/actions");
const { disableTwoFactorAction, regenerateRecoveryCodesAction } = await import("@/app/admin/security/actions");
const { default: TwoFactorSetupPage } = await import("@/app/(site)/(auth)/two-factor/setup/page");
const { default: TwoFactorLoginPage } = await import("@/app/(site)/(auth)/login/two-factor/page");

const meta = { ip: "192.0.2.50", userAgent: "vitest" };
const ip = "192.0.2.50";
const CHALLENGE_COOKIE = "login_challenge";

beforeAll(async () => {
  await resetDb();
});
beforeEach(async () => {
  ctx.jar.clear();
  ctx.options.clear();
  await sql`delete from rate_limits`;
});
afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.ADMIN_2FA_REQUIRED;
  for (const [k, v] of Object.entries(TEST_ENV)) process.env[k] = v;
  resetEnvCache();
});
afterAll(async () => {
  await closeDb();
});

const admin = () => createUser({ role: "admin" });
const form = (values: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
};
function requireTwoFactor() {
  process.env.ADMIN_2FA_REQUIRED = "true";
  resetEnvCache();
}
const sessionsOf = (userId: string) => sql<{ id: string; two_factor_at: Date | null; expires_at: Date }[]>`select id, two_factor_at, expires_at from sessions where user_id = ${userId}`;
const auditsOf = (userId: string, action: string) => sql`select id, metadata from audit_logs where entity_id = ${userId} and action = ${action}`;
const totpRow = async (userId: string) => (await sql<{ secret_ciphertext: string; enabled_at: Date | null; last_used_step: string | null; pending_session_id: string | null }[]>`select * from user_totp where user_id = ${userId}`)[0];
const unusedCodes = async (userId: string) => (await sql<{ n: number }[]>`select count(*)::int as n from user_recovery_codes where user_id = ${userId} and used_at is null`)[0].n;

async function begin(user: { id: string; email: string }, sessionId: string) {
  const details = await beginTwoFactorEnrolment({ userId: user.id, sessionId, account: user.email, issuer: "فرقد" });
  if (!details) throw new Error("already enrolled");
  return { ...details, secret: base32Decode(details.manualKey.replace(/\s/g, "")) };
}
async function challengeFor(user: { email: string }) {
  const res = await loginWithPassword(user.email, TEST_PASSWORD, meta);
  if (res.ok || !res.challenge) throw new Error("expected a challenge");
  return res.challenge;
}

describe("enrolment", () => {
  it("does not turn on without a valid code", async () => {
    const user = await admin();
    const session = await createSession(user.id);
    const { secret } = await begin(user, hashToken(session.token));
    await expect(confirmTwoFactorEnrolment({ userId: user.id, sessionId: hashToken(session.token), code: wrongCode(secret), ip })).resolves.toMatchObject({ ok: false });
    await expect(confirmTwoFactorEnrolment({ userId: user.id, sessionId: hashToken(session.token), code: "not a code", ip })).resolves.toMatchObject({ ok: false });
    await expect(getTwoFactorStatus(user.id)).resolves.toMatchObject({ enabled: false, recoveryRemaining: 0 });
    expect(await unusedCodes(user.id)).toBe(0);
    expect(await auditsOf(user.id, "two_factor.enabled")).toHaveLength(0);
  });

  it("stores the secret encrypted, and only under this account", async () => {
    const user = await admin();
    const { secret } = await enrolAdmin(user);
    const row = await totpRow(user.id);
    for (const encoded of [base32Encode(secret), secret.toString("hex"), secret.toString("base64")]) expect(row.secret_ciphertext).not.toContain(encoded);
    expect(row.secret_ciphertext.startsWith("v1.")).toBe(true);
    expect(openTotpSecret(row.secret_ciphertext, TEST_ENV.APP_SECRET, user.id).equals(secret)).toBe(true);
  });

  it("gives ten single-use codes shown once, and stores only their hashes", async () => {
    const user = await admin();
    const { recoveryCodes } = await enrolAdmin(user);
    expect(recoveryCodes).toHaveLength(10);
    const stored = await sql<{ code_hash: string }[]>`select code_hash from user_recovery_codes where user_id = ${user.id}`;
    expect(stored).toHaveLength(10);
    const dump = JSON.stringify(stored);
    for (const code of recoveryCodes) {
      expect(dump).not.toContain(code);
      expect(dump).not.toContain(code.replace(/-/g, ""));
    }
    for (const row of stored) expect(row.code_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("revokes the other sessions, keeps and stamps this one, and is audited", async () => {
    const user = await admin();
    const other = await createSession(user.id);
    // مختومة من تفعيل سابق: ختمها لا يبقيها حية بعد تفعيل جديد
    await sql`update sessions set two_factor_at = now() where id = ${hashToken(other.token)}`;
    const { session, sessionId } = await enrolAdmin(user);
    expect(await sql`select 1 from sessions where id = ${hashToken(other.token)}`).toHaveLength(0);
    expect(await validateSessionToken(other.token)).toBeNull();
    expect(await validateSessionToken(session.token)).not.toBeNull();
    const rows = await sessionsOf(user.id);
    expect(rows.map((r) => r.id)).toEqual([sessionId]);
    expect(rows[0].two_factor_at).not.toBeNull();
    expect(await auditsOf(user.id, "two_factor.enabled")).toHaveLength(1);
  });

  it("binds the pending secret to the session that opened it", async () => {
    const user = await admin();
    const first = hashToken((await createSession(user.id)).token);
    const second = hashToken((await createSession(user.id)).token);
    const a = await begin(user, first);
    // الصفحة نفسها تعرض السر نفسه عند إعادة تحميلها
    expect((await begin(user, first)).manualKey).toBe(a.manualKey);
    // من عرف كلمة المرور وفتح الصفحة من جلسة أخرى لا يرى السر الذي يسجّله صاحب الحساب
    const b = await begin(user, second);
    expect(b.manualKey).not.toBe(a.manualKey);
    await expect(confirmTwoFactorEnrolment({ userId: user.id, sessionId: first, code: codeAt(a.secret, currentStep()), ip })).resolves.toMatchObject({ ok: false });
    await expect(confirmTwoFactorEnrolment({ userId: user.id, sessionId: first, code: codeAt(b.secret, currentStep()), ip })).resolves.toMatchObject({ ok: false });
    await expect(confirmTwoFactorEnrolment({ userId: user.id, sessionId: second, code: codeAt(b.secret, currentStep()), ip })).resolves.toMatchObject({ ok: true });
  });

  it("does not keep an unconfirmed secret for long", async () => {
    const user = await admin();
    const sessionId = hashToken((await createSession(user.id)).token);
    const a = await begin(user, sessionId);
    await sql`update user_totp set created_at = now() - interval '31 minutes' where user_id = ${user.id}`;
    await expect(confirmTwoFactorEnrolment({ userId: user.id, sessionId, code: codeAt(a.secret, currentStep()), ip })).resolves.toMatchObject({ ok: false });
    expect((await begin(user, sessionId)).manualKey).not.toBe(a.manualKey);
  });

  it("does not replace a secret that is already active, or show it again", async () => {
    const user = await admin();
    const { sessionId } = await enrolAdmin(user);
    const before = await totpRow(user.id);
    await expect(beginTwoFactorEnrolment({ userId: user.id, sessionId, account: user.email, issuer: "فرقد" })).resolves.toBeNull();
    expect((await totpRow(user.id)).secret_ciphertext).toBe(before.secret_ciphertext);
  });

  it("limits wrong codes per account", async () => {
    const user = await admin();
    const sessionId = hashToken((await createSession(user.id)).token);
    const { secret } = await begin(user, sessionId);
    for (let i = 0; i < 5; i++) await confirmTwoFactorEnrolment({ userId: user.id, sessionId, code: wrongCode(secret), ip });
    const refused = await confirmTwoFactorEnrolment({ userId: user.id, sessionId, code: codeAt(secret, currentStep()), ip });
    expect(refused).toMatchObject({ ok: false, retryAfter: expect.any(Number) });
    await expect(getTwoFactorStatus(user.id)).resolves.toMatchObject({ enabled: false });
  });

  it("the page shows an inline QR, the manual key and the link, with no external image or script", async () => {
    requireTwoFactor();
    const user = await admin();
    ctx.jar.set(SESSION_COOKIE, (await createSession(user.id)).token);
    const html = renderToStaticMarkup(await TwoFactorSetupPage());
    expect(html).toMatch(/<svg[^>]*role="img"/);
    expect(html).toContain('data-testid="totp-qr"');
    expect(html).toContain('data-testid="totp-manual-key"');
    expect(html).toMatch(/href="otpauth:\/\/totp\//);
    const qrStart = html.lastIndexOf("<svg", html.indexOf('data-testid="totp-qr"'));
    const qr = html.slice(qrStart, html.indexOf("</svg>", qrStart));
    expect(qr).toContain("<path");
    expect(qr).not.toMatch(/<image|<script|href=/);
    expect(html).not.toMatch(/<img/);
  });

  it("the page is for admins only", async () => {
    const student = await createUser();
    ctx.jar.set(SESSION_COOKIE, (await createSession(student.id)).token);
    await expect(TwoFactorSetupPage()).rejects.toThrow("NEXT_NOT_FOUND");
    ctx.jar.clear();
    await expect(TwoFactorSetupPage()).rejects.toThrow("NEXT_REDIRECT /login");
  });

  it("the action returns the codes and leaves the cookies alone, so the page does not lose them", async () => {
    const user = await admin();
    const session = await createSession(user.id);
    const sessionId = hashToken(session.token);
    ctx.jar.set(SESSION_COOKIE, session.token);
    const { secret } = await begin(user, sessionId);
    const out = await confirmTwoFactorSetupAction(null, form({ code: codeAt(secret, currentStep()) }));
    expect(out?.ok).toBe(true);
    expect(out?.secrets?.recoveryCodes?.split("\n")).toHaveLength(10);
    expect(ctx.options.size).toBe(0);
  });

  it("the action refuses a student and a visitor", async () => {
    await expect(confirmTwoFactorSetupAction(null, form({ code: "123456" }))).resolves.toMatchObject({ error: expect.any(String) });
    const student = await createUser();
    const session = await createSession(student.id);
    ctx.jar.set(SESSION_COOKIE, session.token);
    // حتى لو وُجد سر معلق بطريقة ما، والرمز صحيح
    const { secret } = await begin(student, hashToken(session.token));
    await expect(confirmTwoFactorSetupAction(null, form({ code: codeAt(secret, currentStep()) }))).resolves.toMatchObject({ error: expect.any(String) });
    expect((await totpRow(student.id)).enabled_at).toBeNull();
  });
});

describe("checking a code", () => {
  it("refuses the same code twice, even from different places", async () => {
    const user = await admin();
    const { secret } = await enrolAdmin(user);
    const code = await freshCode(user.id, secret);
    await expect(verifyStepUpCode({ userId: user.id, code, ip })).resolves.toMatchObject({ ok: true, method: "totp" });
    await expect(verifyStepUpCode({ userId: user.id, code, ip })).resolves.toMatchObject({ ok: false });
  });

  it("the code that finished enrolment cannot be used again", async () => {
    const user = await admin();
    const now = 1_900_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    const { secret } = await enrolAdmin(user);
    await expect(verifyStepUpCode({ userId: user.id, code: codeAt(secret, timeStep(now)), ip })).resolves.toMatchObject({ ok: false });
  });

  it("lets only one of many concurrent requests use a code", async () => {
    const user = await admin();
    const { secret } = await enrolAdmin(user);
    const code = await freshCode(user.id, secret);
    const results = await Promise.all(Array.from({ length: 5 }, () => verifyStepUpCode({ userId: user.id, code, ip })));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it("accepts one step either way, refuses two, and never goes backwards", async () => {
    const user = await admin();
    const { secret } = await enrolAdmin(user);
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);
    const step = timeStep(now);
    const last = async (value: number | null) => sql`update user_totp set last_used_step = ${value} where user_id = ${user.id}`;

    await last(step - 5);
    await expect(verifyStepUpCode({ userId: user.id, code: codeAt(secret, step + 2), ip })).resolves.toMatchObject({ ok: false });
    await expect(verifyStepUpCode({ userId: user.id, code: codeAt(secret, step - 2), ip })).resolves.toMatchObject({ ok: false });
    await sql`delete from rate_limits`;
    await expect(verifyStepUpCode({ userId: user.id, code: codeAt(secret, step - 1), ip })).resolves.toMatchObject({ ok: true });
    await expect(verifyStepUpCode({ userId: user.id, code: codeAt(secret, step + 1), ip })).resolves.toMatchObject({ ok: true });
    expect(Number((await totpRow(user.id)).last_used_step)).toBe(step + 1);
    // بعد قبول خطوة لاحقة لا تعود خطوة أقدم صالحة، ولو كانت داخل النافذة
    await expect(verifyStepUpCode({ userId: user.id, code: codeAt(secret, step), ip })).resolves.toMatchObject({ ok: false });
  });

  it("a recovery code works once, typed any way", async () => {
    const user = await admin();
    const { recoveryCodes } = await enrolAdmin(user);
    await expect(verifyStepUpCode({ userId: user.id, code: recoveryCodes[0].toLowerCase().replace(/-/g, " "), ip })).resolves.toMatchObject({ ok: true, method: "recovery" });
    await expect(verifyStepUpCode({ userId: user.id, code: recoveryCodes[0], ip })).resolves.toMatchObject({ ok: false });
    expect(await unusedCodes(user.id)).toBe(9);
    const [audit] = await auditsOf(user.id, "two_factor.recovery_code_used");
    expect(audit.metadata).toMatchObject({ purpose: "step_up", remaining: 9 });
    expect(JSON.stringify(audit)).not.toContain(recoveryCodes[0]);
  });

  it("a recovery code is consumed once under concurrency", async () => {
    const user = await admin();
    const { recoveryCodes } = await enrolAdmin(user);
    const results = await Promise.all(Array.from({ length: 5 }, () => verifyStepUpCode({ userId: user.id, code: recoveryCodes[1], ip })));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await unusedCodes(user.id)).toBe(9);
  });

  it("a recovery code is consumed once when requests overlap at the row", async () => {
    const user = await admin();
    const { recoveryCodes } = await enrolAdmin(user);
    const hash = hashRecoveryCode(parseSecondFactorCode(recoveryCodes[2])!.code, TEST_ENV.APP_SECRET, user.id);
    let release!: () => void;
    let locked!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const isLocked = new Promise<void>((r) => (locked = r));
    // يمسك الصف، فتقرأه كل الطلبات غير مستخدم ثم تنتظر عند التحديث
    const holder = sql.begin(async (tx) => {
      await tx`select id from user_recovery_codes where user_id = ${user.id} and code_hash = ${hash} for update`;
      locked();
      await gate;
    });
    await isLocked;
    const pending = Promise.all(Array.from({ length: 3 }, () => verifyStepUpCode({ userId: user.id, code: recoveryCodes[2], ip })));
    await new Promise((r) => setTimeout(r, 300));
    release();
    await holder;
    const results = await pending;
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await unusedCodes(user.id)).toBe(9);
  });

  it("does not accept another account's recovery code", async () => {
    const a = await admin();
    const b = await admin();
    const { recoveryCodes } = await enrolAdmin(a);
    await enrolAdmin(b);
    await expect(verifyStepUpCode({ userId: b.id, code: recoveryCodes[0], ip })).resolves.toMatchObject({ ok: false });
  });

  it("stops after five wrong codes for this account only, and a good code then clears the count", async () => {
    const a = await admin();
    const b = await admin();
    const first = await enrolAdmin(a);
    const second = await enrolAdmin(b);
    for (let i = 0; i < 5; i++) await expect(verifyStepUpCode({ userId: a.id, code: wrongCode(first.secret), ip: `198.51.100.${i}` })).resolves.toMatchObject({ ok: false });
    // عنوان آخر لا يعطي محاولات جديدة
    await expect(verifyStepUpCode({ userId: a.id, code: await freshCode(a.id, first.secret), ip: "203.0.113.9" })).resolves.toMatchObject({ ok: false, retryAfter: expect.any(Number) });
    await expect(verifyStepUpCode({ userId: b.id, code: await freshCode(b.id, second.secret), ip })).resolves.toMatchObject({ ok: true });
    await sql`update rate_limits set reset_at = now() + interval '1 hour' where key = ${`2fa:fail:${a.id}`}`;
    await expect(verifyStepUpCode({ userId: a.id, code: await freshCode(a.id, first.secret), ip })).resolves.toMatchObject({ ok: true });
    expect(await sql`select 1 from rate_limits where key = ${`2fa:fail:${a.id}`}`).toHaveLength(0);
  });

  it("a bad recovery code counts the same as a bad TOTP code", async () => {
    const user = await admin();
    const { secret } = await enrolAdmin(user);
    for (let i = 0; i < 5; i++) await verifyStepUpCode({ userId: user.id, code: "AAAA-BBBB-CCCC-DDDD", ip });
    await expect(verifyStepUpCode({ userId: user.id, code: await freshCode(user.id, secret), ip })).resolves.toMatchObject({ ok: false, retryAfter: expect.any(Number) });
  });
});

describe("regenerating recovery codes", () => {
  it("needs a valid code, replaces every old code, and is audited", async () => {
    const user = await admin();
    const { secret, recoveryCodes } = await enrolAdmin(user);
    await expect(regenerateRecoveryCodes({ userId: user.id, code: wrongCode(secret), ip })).resolves.toMatchObject({ ok: false });
    expect(await auditsOf(user.id, "two_factor.recovery_codes_regenerated")).toHaveLength(0);
    const out = await regenerateRecoveryCodes({ userId: user.id, code: await freshCode(user.id, secret), ip });
    if (!out.ok) throw new Error(out.error);
    expect(out.recoveryCodes).toHaveLength(10);
    expect(out.recoveryCodes.some((c) => recoveryCodes.includes(c))).toBe(false);
    await expect(verifyStepUpCode({ userId: user.id, code: recoveryCodes[0], ip })).resolves.toMatchObject({ ok: false });
    await expect(verifyStepUpCode({ userId: user.id, code: out.recoveryCodes[0], ip })).resolves.toMatchObject({ ok: true });
    expect(await auditsOf(user.id, "two_factor.recovery_codes_regenerated")).toHaveLength(1);
  });

  it("the action returns the codes to the form", async () => {
    const user = await admin();
    const { secret, session } = await enrolAdmin(user);
    ctx.jar.set(SESSION_COOKIE, session.token);
    const out = await regenerateRecoveryCodesAction({}, form({ twoFactorCode: await freshCode(user.id, secret) }));
    expect(out?.secrets?.recoveryCodes?.split("\n")).toHaveLength(10);
    expect(ctx.options.size).toBe(0);
  });
});

describe("turning it off", () => {
  it("needs a valid code", async () => {
    const user = await admin();
    const { secret, sessionId } = await enrolAdmin(user);
    await expect(disableTwoFactor({ userId: user.id, sessionId, code: wrongCode(secret), ip })).resolves.toMatchObject({ ok: false });
    await expect(getTwoFactorStatus(user.id)).resolves.toMatchObject({ enabled: true });
  });

  it("removes everything, revokes other sessions, keeps this one, and is audited", async () => {
    const user = await admin();
    const { secret, session, sessionId } = await enrolAdmin(user);
    const challenge = await startLoginChallenge(user.id);
    if (!challenge.ok) throw new Error("challenge");
    await sql`insert into sessions (id, user_id, expires_at, two_factor_at) values (${"f".repeat(64)}, ${user.id}, now() + interval '1 hour', now())`;
    await expect(disableTwoFactor({ userId: user.id, sessionId, code: await freshCode(user.id, secret), ip })).resolves.toEqual({ ok: true });
    expect(await totpRow(user.id)).toBeUndefined();
    expect(await unusedCodes(user.id)).toBe(0);
    expect((await sessionsOf(user.id)).map((s) => s.id)).toEqual([sessionId]);
    expect(await validateSessionToken(session.token)).not.toBeNull();
    await expect(loginChallengeIsLive(challenge.token)).resolves.toBe(false);
    expect(await auditsOf(user.id, "two_factor.disabled")).toHaveLength(1);
  });

  it("when required, sends the owner straight back to enrolment", async () => {
    requireTwoFactor();
    const user = await admin();
    const { secret, session } = await enrolAdmin(user);
    ctx.jar.set(SESSION_COOKIE, session.token);
    await expect(disableTwoFactorAction({}, form({ twoFactorCode: await freshCode(user.id, secret) }))).rejects.toThrow("NEXT_REDIRECT /two-factor/setup");
    await expect(getCurrentUser()).resolves.toBeNull();
    await expect(requireUser("/admin")).rejects.toThrow("NEXT_REDIRECT /two-factor/setup");
  });
});

describe("signing in", () => {
  it("the password step opens no session and stores only a hash of the challenge", async () => {
    const user = await admin();
    await enrolAdmin(user);
    await sql`delete from sessions where user_id = ${user.id}`;
    const res = await loginWithPassword(user.email, TEST_PASSWORD, meta);
    expect(res.ok).toBe(false);
    if (res.ok || !res.challenge) throw new Error("expected a challenge");
    expect("token" in res).toBe(false);
    expect(await sessionsOf(user.id)).toHaveLength(0);
    const rows = await sql<{ id: string; user_id: string; expires_at: Date }[]>`select id, user_id, expires_at from login_challenges where user_id = ${user.id}`;
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(hashToken(res.challenge.token));
    expect(rows[0].id).not.toBe(res.challenge.token);
    expect(new Date(rows[0].expires_at).getTime()).toBeLessThanOrEqual(Date.now() + 5 * 60_000 + 1000);
  });

  it("a wrong password gives the usual error and no challenge", async () => {
    const user = await admin();
    await enrolAdmin(user);
    const res = await loginWithPassword(user.email, "Wrong-Password-1", meta);
    expect(res).toEqual({ ok: false, error: "البريد الإلكتروني أو كلمة المرور غير صحيحة." });
    expect(await sql`select 1 from login_challenges where user_id = ${user.id}`).toHaveLength(0);
  });

  it("the right code opens a marked session and spends the challenge", async () => {
    const user = await admin();
    const { secret } = await enrolAdmin(user);
    await sql`delete from sessions where user_id = ${user.id}`;
    const { token } = await challengeFor(user);
    const res = await completeTwoFactorLogin(token, await freshCode(user.id, secret), meta);
    if (!res.ok) throw new Error(res.error);
    expect(res.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + ADMIN_SESSION_MS);
    expect(await validateSessionToken(res.token)).not.toBeNull();
    const [row] = await sessionsOf(user.id);
    expect(row.two_factor_at).not.toBeNull();
    await expect(completeTwoFactorLogin(token, await freshCode(user.id, secret), meta)).resolves.toMatchObject({ ok: false, expired: true });
    expect(await sessionsOf(user.id)).toHaveLength(1);
  });

  it("a recovery code signs in too, and is spent", async () => {
    const user = await admin();
    const { recoveryCodes } = await enrolAdmin(user);
    const { token } = await challengeFor(user);
    await expect(completeTwoFactorLogin(token, recoveryCodes[3], meta)).resolves.toMatchObject({ ok: true });
    expect(await unusedCodes(user.id)).toBe(9);
    expect((await auditsOf(user.id, "two_factor.recovery_code_used"))[0].metadata).toMatchObject({ purpose: "login" });
  });

  it("an expired challenge is refused, even with a valid code", async () => {
    const user = await admin();
    const { secret } = await enrolAdmin(user);
    const { token } = await challengeFor(user);
    await sql`update login_challenges set expires_at = now() - interval '1 second' where user_id = ${user.id}`;
    await expect(loginChallengeIsLive(token)).resolves.toBe(false);
    await expect(completeTwoFactorLogin(token, await freshCode(user.id, secret), meta)).resolves.toMatchObject({ ok: false, expired: true });
  });

  it("a made-up or missing challenge is refused", async () => {
    await expect(completeTwoFactorLogin("no-such-token", "123456", meta)).resolves.toMatchObject({ ok: false, expired: true });
    await expect(completeTwoFactorLogin(undefined, "123456", meta)).resolves.toMatchObject({ ok: false, expired: true });
    await expect(completeTwoFactorLogin("x".repeat(101), "123456", meta)).resolves.toMatchObject({ ok: false, expired: true });
  });

  it("a challenge belongs to one account: another account's code does not finish it", async () => {
    const a = await admin();
    const b = await admin();
    await enrolAdmin(a);
    const second = await enrolAdmin(b);
    await sql`delete from sessions where user_id = ${a.id}`;
    const { token } = await challengeFor(a);
    await expect(completeTwoFactorLogin(token, await freshCode(b.id, second.secret), meta)).resolves.toMatchObject({ ok: false });
    await expect(completeTwoFactorLogin(token, second.recoveryCodes[0], meta)).resolves.toMatchObject({ ok: false });
    expect(await sessionsOf(a.id)).toHaveLength(0);
  });

  it("drops the challenge after five wrong codes", async () => {
    const user = await admin();
    const { secret } = await enrolAdmin(user);
    const { token } = await challengeFor(user);
    for (let i = 0; i < 4; i++) {
      const res = await completeTwoFactorLogin(token, wrongCode(secret), meta);
      expect(res.ok).toBe(false);
      expect(res).not.toHaveProperty("expired");
    }
    await expect(completeTwoFactorLogin(token, wrongCode(secret), meta)).resolves.toMatchObject({ ok: false, expired: true });
    expect(await sql`select 1 from login_challenges where user_id = ${user.id}`).toHaveLength(0);
  });

  it("a fresh password login does not reset the failure count on the code", async () => {
    const user = await admin();
    const { secret } = await enrolAdmin(user);
    for (let i = 0; i < 5; i++) {
      const { token } = await challengeFor(user);
      await completeTwoFactorLogin(token, wrongCode(secret), meta);
    }
    const { token } = await challengeFor(user);
    await expect(completeTwoFactorLogin(token, await freshCode(user.id, secret), meta)).resolves.toMatchObject({ ok: false, retryAfter: expect.any(Number) });
  });

  it("a new password login cancels the earlier challenge", async () => {
    const user = await admin();
    await enrolAdmin(user);
    const first = await challengeFor(user);
    const second = await challengeFor(user);
    await expect(loginChallengeIsLive(first.token)).resolves.toBe(false);
    await expect(loginChallengeIsLive(second.token)).resolves.toBe(true);
    expect(await sql`select 1 from login_challenges where user_id = ${user.id}`).toHaveLength(1);
  });

  it("two concurrent completions open one session only", async () => {
    const user = await admin();
    const { secret } = await enrolAdmin(user);
    await sql`delete from sessions where user_id = ${user.id}`;
    const { token } = await challengeFor(user);
    const code = await freshCode(user.id, secret);
    const results = await Promise.all([completeTwoFactorLogin(token, code, meta), completeTwoFactorLogin(token, code, meta), completeTwoFactorLogin(token, code, meta)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await sessionsOf(user.id)).toHaveLength(1);
  });

  it("limits requests from one address, valid challenge or not", async () => {
    const ipMeta = { ip: "198.51.100.200", userAgent: "vitest" };
    for (let i = 0; i < 60; i++) await completeTwoFactorLogin("nope", "123456", ipMeta);
    const res = await completeTwoFactorLogin("nope", "123456", ipMeta);
    expect(res).toMatchObject({ ok: false, retryAfter: expect.any(Number) });
    expect(res).not.toHaveProperty("expired");
  });

  it("limits how often the password step can open a challenge", async () => {
    const user = await admin();
    await enrolAdmin(user);
    for (let i = 0; i < 20; i++) await expect(startLoginChallenge(user.id)).resolves.toMatchObject({ ok: true });
    await expect(startLoginChallenge(user.id)).resolves.toMatchObject({ ok: false, retryAfter: expect.any(Number) });
  });

  it("a suspended account cannot finish", async () => {
    const user = await admin();
    const { secret } = await enrolAdmin(user);
    const { token } = await challengeFor(user);
    await sql`update users set is_active = false where id = ${user.id}`;
    await expect(completeTwoFactorLogin(token, await freshCode(user.id, secret), meta)).resolves.toMatchObject({ ok: false, expired: true });
  });

  it("changing the password cancels a pending challenge", async () => {
    const user = await admin();
    const { sessionId } = await enrolAdmin(user);
    const { token } = await challengeFor(user);
    await expect(changePassword(user.id, TEST_PASSWORD, "A-Brand-New-Passw0rd-2026", sessionId)).resolves.toEqual({ ok: true });
    await expect(loginChallengeIsLive(token)).resolves.toBe(false);
  });

  it("students and teachers get no second step", async () => {
    for (const role of ["student", "teacher"] as const) {
      const user = await createUser({ role });
      await expect(loginWithPassword(user.email, TEST_PASSWORD, meta)).resolves.toMatchObject({ ok: true });
    }
  });

  it("the actions carry the challenge in a cookie scoped to the login path, then swap it for a session", async () => {
    const user = await admin();
    const { secret } = await enrolAdmin(user);
    ctx.jar.clear();
    await expect(loginAction(null, form({ email: user.email, password: TEST_PASSWORD, next: "/admin/orders" }))).rejects.toThrow("NEXT_REDIRECT /login/two-factor?next=%2Fadmin%2Forders");
    expect(ctx.jar.has(SESSION_COOKIE)).toBe(false);
    expect(ctx.jar.has(CHALLENGE_COOKIE)).toBe(true);
    expect(ctx.options.get(CHALLENGE_COOKIE)).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/login" });

    await expect(verifyLoginCodeAction(null, form({ code: wrongCode(secret), next: "/admin/orders" }))).resolves.toMatchObject({ error: expect.any(String) });
    expect(ctx.jar.has(SESSION_COOKIE)).toBe(false);

    await expect(verifyLoginCodeAction(null, form({ code: await freshCode(user.id, secret), next: "/admin/orders" }))).rejects.toThrow("NEXT_REDIRECT /admin/orders");
    expect(ctx.jar.has(SESSION_COOKIE)).toBe(true);
    expect(ctx.jar.has(CHALLENGE_COOKIE)).toBe(false);
    expect(new Date(ctx.options.get(SESSION_COOKIE)!.expires as Date).getTime()).toBeLessThanOrEqual(Date.now() + ADMIN_SESSION_MS);
  });

  it("the action does not follow a next address off the site", async () => {
    const user = await admin();
    const { secret } = await enrolAdmin(user);
    const { token } = await challengeFor(user);
    ctx.jar.set(CHALLENGE_COOKIE, token);
    await expect(verifyLoginCodeAction(null, form({ code: await freshCode(user.id, secret), next: "https://evil.example/admin" }))).rejects.toThrow("NEXT_REDIRECT /admin");
  });

  it("an expired challenge goes back to the password step", async () => {
    ctx.jar.set(CHALLENGE_COOKIE, "gone");
    await expect(verifyLoginCodeAction(null, form({ code: "123456", next: "/admin" }))).rejects.toThrow("NEXT_REDIRECT /login?twoFactor=expired&next=%2Fadmin");
    expect(ctx.jar.has(CHALLENGE_COOKIE)).toBe(false);
  });

  it("the second-step page opens only with a live challenge", async () => {
    await expect(TwoFactorLoginPage({ searchParams: Promise.resolve({ next: "/admin" }) })).rejects.toThrow("NEXT_REDIRECT /login?twoFactor=expired");
    const user = await admin();
    await enrolAdmin(user);
    ctx.jar.set(CHALLENGE_COOKIE, (await challengeFor(user)).token);
    expect(renderToStaticMarkup(await TwoFactorLoginPage({ searchParams: Promise.resolve({ next: "/admin" }) }))).toContain("two-factor-login-form");
  });
});

describe("the requirement", () => {
  const withEnv = (nodeEnv: string, flag?: string) => {
    vi.stubEnv("NODE_ENV", nodeEnv);
    if (flag === undefined) delete process.env.ADMIN_2FA_REQUIRED;
    else process.env.ADMIN_2FA_REQUIRED = flag;
    resetEnvCache();
    return adminTwoFactorRequired();
  };

  it("is on in production unless explicitly switched off, and off elsewhere unless forced", () => {
    try {
      expect(withEnv("production")).toBe(true);
      expect(withEnv("production", "false")).toBe(false);
      expect(withEnv("production", "true")).toBe(true);
      expect(withEnv("development")).toBe(false);
      expect(withEnv("test")).toBe(false);
      expect(withEnv("test", "true")).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("refuses a value that is neither true nor false", () => {
    try {
      vi.stubEnv("ADMIN_2FA_REQUIRED", "no");
      resetEnvCache();
      expect(() => adminTwoFactorRequired()).toThrow();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("sends an admin without two-factor to enrolment and nowhere else", async () => {
    requireTwoFactor();
    const user = await admin();
    const res = await loginWithPassword(user.email, TEST_PASSWORD, meta);
    if (!res.ok) throw new Error(res.error);
    expect(res.needsTwoFactorEnrolment).toBe(true);
    ctx.jar.set(SESSION_COOKIE, res.token);
    await expect(getCurrentUser()).resolves.toBeNull();
    await expect(requireUser("/admin")).rejects.toThrow("NEXT_REDIRECT /two-factor/setup");
    await expect(requireStaff()).rejects.toThrow("NEXT_REDIRECT /two-factor/setup");
    await expect(regenerateRecoveryCodesAction({}, form({ twoFactorCode: "123456" }))).resolves.toEqual({ error: "غير مصرح لك بتنفيذ هذا الإجراء" });
    // صفحة التسجيل وحدها تفتح
    expect(renderToStaticMarkup(await TwoFactorSetupPage())).toContain("two-factor-setup-form");
  });

  it("the login action goes to enrolment whatever the next address", async () => {
    requireTwoFactor();
    const user = await admin();
    await expect(loginAction(null, form({ email: user.email, password: TEST_PASSWORD, next: "/admin/orders" }))).rejects.toThrow("NEXT_REDIRECT /two-factor/setup");
  });

  it("finishing enrolment opens the panel on the same session", async () => {
    requireTwoFactor();
    const user = await admin();
    const session = await createSession(user.id);
    ctx.jar.set(SESSION_COOKIE, session.token);
    const { secret } = await begin(user, hashToken(session.token));
    await expect(confirmTwoFactorSetupAction(null, form({ code: codeAt(secret, currentStep()) }))).resolves.toMatchObject({ ok: true });
    await expect(getCurrentUser()).resolves.toMatchObject({ id: user.id });
  });

  it("does not touch students or teachers", async () => {
    requireTwoFactor();
    for (const role of ["student", "teacher"] as const) {
      const user = await createUser({ role });
      const { token } = await createSession(user.id);
      await expect(validateSessionToken(token)).resolves.toMatchObject({ needsTwoFactorEnrolment: false });
    }
  });

  it("when off, an admin without two-factor works normally", async () => {
    const user = await admin();
    const res = await loginWithPassword(user.email, TEST_PASSWORD, meta);
    if (!res.ok) throw new Error(res.error);
    expect(res.needsTwoFactorEnrolment).toBe(false);
    ctx.jar.set(SESSION_COOKIE, res.token);
    await expect(getCurrentUser()).resolves.toMatchObject({ id: user.id });
  });
});

describe("admin session lifetime", () => {
  it("is twelve hours from sign-in", async () => {
    const user = await admin();
    const { expiresAt } = await createSession(user.id);
    expect(expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + ADMIN_SESSION_MS);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now() + ADMIN_SESSION_MS - 60_000);
  });

  it("is not renewed by use", async () => {
    const user = await admin();
    const { token } = await createSession(user.id);
    await sql`update sessions set created_at = now() - interval '11 hours', expires_at = now() + interval '1 hour' where user_id = ${user.id}`;
    const before = (await sessionsOf(user.id))[0].expires_at;
    await expect(validateSessionToken(token)).resolves.not.toBeNull();
    expect((await sessionsOf(user.id))[0].expires_at).toEqual(before);
  });

  it("clamps a thirty-day session written before this version", async () => {
    const user = await admin();
    const { token } = await createSession(user.id);
    await sql`update sessions set created_at = now() - interval '13 hours', expires_at = now() + interval '29 days' where user_id = ${user.id}`;
    await expect(validateSessionToken(token)).resolves.toBeNull();
    expect(await sessionsOf(user.id)).toHaveLength(0);
  });

  it("reports the clamped time for a young session written before this version", async () => {
    const user = await admin();
    const { token } = await createSession(user.id);
    await sql`update sessions set created_at = now() - interval '1 hour', expires_at = now() + interval '29 days' where user_id = ${user.id}`;
    const out = await validateSessionToken(token);
    expect(out!.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 11 * 3600_000 + 5000);
  });

  it("a session without the second-factor mark does not work on an account that has it", async () => {
    const user = await admin();
    await enrolAdmin(user);
    const { token } = await createSession(user.id);
    await expect(validateSessionToken(token)).resolves.toBeNull();
    expect(await sql`select 1 from sessions where id = ${hashToken(token)}`).toHaveLength(0);
  });

  it("a student's session stays long and renews as before", async () => {
    const student = await createUser();
    const { token, expiresAt } = await createSession(student.id);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 86400_000);
    await sql`update sessions set created_at = now() - interval '20 days', expires_at = now() + interval '10 days' where user_id = ${student.id}`;
    const out = await validateSessionToken(token);
    expect(out!.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 86400_000);
  });
});
