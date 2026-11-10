import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCache } from "@/server/env";
import { loginWithPassword, registerStudent, requestPasswordReset, resetPassword } from "@/server/auth/service";
import { confirmEmailToken, requestEmailCorrection, sendEmailVerificationLink } from "@/server/auth/email-verification";
import { createSession, hashToken, TEACHER_SESSION_MS, validateSessionToken } from "@/server/auth/session";
import { issueDeviceProof } from "@/server/auth/device-proof";
import { correctStudentEmail } from "@/server/admin/student-accounts";
import { anonymizeStudent } from "@/server/admin/student-anonymize";
import { setTeacherAccountActive } from "@/server/admin/teachers";
import { closeDataRequest, listOpenDataRequests, myDataRequests, openDataRequestCount, requestAccountData, withdrawAccountData } from "@/server/platform/data-requests";
import { OPS_ALERTS } from "@/server/platform/ops-alerts";
import { FILE_OPEN_LIMITS } from "@/server/access/delivery";
import { CONSENT_VERSIONS, GUARDIAN_ACCOUNT_HINT, GUARDIAN_ACCOUNT_TEXT } from "@/lib/consent";
import { startSmtpSink, type SmtpSink } from "../mocks/smtp-sink";
import { closeDb, resetDb, sql } from "../helpers/db";
import { createTeacher, createUser, TEST_PASSWORD } from "../helpers/factories";
import { TEST_ENV } from "../test-env";

const ctx = vi.hoisted(() => ({ after: [] as (() => unknown)[], headers: new Headers(), cookiesSet: [] as string[], redirected: [] as string[], hashes: 0, user: null as unknown, session: null as unknown }));

vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: (fn: () => unknown) => void ctx.after.push(fn) }));
vi.mock("next/headers", () => ({ headers: async () => ctx.headers, cookies: async () => ({ get: () => undefined, set: (name: string) => void ctx.cookiesSet.push(name) }) }));
vi.mock("next/cache", async (original) => ({ ...(await original<typeof import("next/cache")>()), revalidatePath: () => {} }));
vi.mock("next/navigation", async (original) => ({
  ...(await original<typeof import("next/navigation")>()),
  redirect: (url: string) => {
    ctx.redirected.push(url);
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
}));
vi.mock("@/server/auth/password", async (original) => {
  const real = await original<typeof import("@/server/auth/password")>();
  return {
    ...real,
    hashPassword: (password: string) => {
      ctx.hashes++;
      return real.hashPassword(password);
    },
  };
});
vi.mock("@/server/auth/session", async (original) => ({ ...(await original<typeof import("@/server/auth/session")>()), getCurrentUser: async () => ctx.user, getCurrentSession: async () => ctx.session }));

const { registerAction } = await import("@/app/(site)/(auth)/actions");
const { confirmEmailAction } = await import("@/app/(site)/(auth)/verify-email/actions");
const { requestDataAction, withdrawDataRequestAction } = await import("@/app/(site)/account/actions");

let sink: SmtpSink;
const IP = "198.51.100.60";
const META = { ip: IP, userAgent: "vitest-browser" };

const realMail = () => {
  process.env.MAIL_DRIVER = "smtp";
  process.env.SMTP_HOST = "127.0.0.1";
  process.env.SMTP_PORT = String(sink.port);
  process.env.MAIL_FROM = "no-reply@farqad.test";
  resetEnvCache();
};
const form = (values: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
};
const mailsTo = (address: string) => sink.messages.filter((m) => m.to.includes(address));
const seed = (key: string, count: number) => sql`insert into rate_limits (key, count, reset_at) values (${key}, ${count}, now() + interval '1 hour') on conflict (key) do update set count = excluded.count`;
const counter = async (key: string) => (await sql<{ count: number }[]>`select count from rate_limits where key = ${key}`)[0]?.count ?? null;
const auditCount = async (action: string, entityId: string) => (await sql<{ n: number }[]>`select count(*)::int as n from audit_logs where action = ${action} and entity_id = ${entityId}`)[0].n;
const sessionCount = async (userId: string) => (await sql<{ n: number }[]>`select count(*)::int as n from sessions where user_id = ${userId}`)[0].n;
const runAfter = async () => {
  for (const fn of ctx.after.splice(0)) await fn();
};

beforeAll(async () => {
  await resetDb();
  sink = await startSmtpSink();
});
afterAll(async () => {
  await sink.close();
  await closeDb();
});
beforeEach(() => {
  sink.clear();
  ctx.after.length = 0;
  ctx.cookiesSet.length = 0;
  ctx.redirected.length = 0;
  ctx.hashes = 0;
  ctx.user = null;
  ctx.session = null;
  ctx.headers = new Headers({ "x-forwarded-for": IP, "user-agent": META.userAgent });
  return sql`delete from rate_limits`;
});
afterEach(() => {
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_PORT;
  delete process.env.MAIL_FROM;
  for (const [k, v] of Object.entries(TEST_ENV)) process.env[k] = v;
  resetEnvCache();
});

const PASSWORD = "Student-Pass-1";
const registration = (email: string, password = PASSWORD) => form({ fullName: "طالب جديد", email, password, passwordConfirm: password, terms: "on", guardianAccount: "on" });
const serviceInput = (email: string, over: Partial<{ acceptedDocuments: boolean; acceptedGuardian: boolean; password: string }> = {}) => ({ fullName: "طالب جديد", email, password: PASSWORD, phone: null, acceptedDocuments: true, acceptedGuardian: true, ...over });

describe("K029: registration does not tell a stranger whether an address has an account", () => {
  it("answers identically for a new address and a registered one, and sets no cookie on either", async () => {
    const existing = await createUser({ email: "taken-answer@farqad.test" });
    const fresh = await registerAction(null, registration("free-answer@farqad.test"));
    const taken = await registerAction(null, registration("taken-answer@farqad.test"));
    expect(fresh?.ok).toBe(true);
    expect({ ...taken, values: undefined }).toEqual({ ...fresh, values: undefined });
    expect(taken?.values).toEqual({ email: "taken-answer@farqad.test" });
    expect(ctx.cookiesSet).toEqual([]);
    expect(ctx.redirected).toEqual([]);
    expect(await sessionCount(existing.id)).toBe(0);
    const [created] = await sql<{ id: string }[]>`select id from users where email = 'free-answer@farqad.test'`;
    expect(await sessionCount(created.id)).toBe(0);
  });

  it("does the same expensive work either way, so the timing does not give it away", async () => {
    await createUser({ email: "taken-work@farqad.test" });
    await registerStudent(serviceInput("free-work@farqad.test"), META);
    expect(ctx.hashes).toBe(1);
    await registerStudent(serviceInput("taken-work@farqad.test"), META);
    expect(ctx.hashes).toBe(2);
  });

  it("leaves a registered account exactly as it was", async () => {
    const u = await createUser({ email: "taken-still@farqad.test", fullName: "الاسم الأصلي" });
    const [before] = await sql`select password_hash, full_name, phone, grade_id, role from users where id = ${u.id}`;
    await expect(registerStudent(serviceInput("TAKEN-still@farqad.test".toLowerCase()), META)).resolves.toEqual({ ok: true, userId: null });
    const [after] = await sql`select password_hash, full_name, phone, grade_id, role from users where id = ${u.id}`;
    expect(after).toEqual(before);
    expect(await sql`select 1 from consent_records where user_id = ${u.id} and kind = 'guardian_account'`).toHaveLength(0);
    await expect(loginWithPassword(u.email, TEST_PASSWORD, META)).resolves.toMatchObject({ ok: true });
  });

  it("with mail in log mode an honest student still gets in, with the password just chosen", async () => {
    expect(process.env.MAIL_DRIVER).not.toBe("smtp");
    const res = await registerAction(null, registration("honest-log@farqad.test"));
    expect(res?.ok).toBe(true);
    expect(res?.message).not.toContain("رسالة");
    expect(ctx.after).toHaveLength(0);
    await expect(loginWithPassword("honest-log@farqad.test", PASSWORD, META)).resolves.toMatchObject({ ok: true });
  });

  it("with real mail a new address gets the link and a registered one a notice with no link, after the response", async () => {
    realMail();
    await createUser({ email: "taken-mail@farqad.test" });
    await registerAction(null, registration("free-mail@farqad.test"));
    await registerAction(null, registration("taken-mail@farqad.test"));
    expect(sink.messages).toHaveLength(0);
    await runAfter();
    expect(mailsTo("free-mail@farqad.test")).toHaveLength(1);
    expect(mailsTo("free-mail@farqad.test")[0].text).toContain("/verify-email/confirm?token=");
    const [notice] = mailsTo("taken-mail@farqad.test");
    expect(notice.text).toContain("لك حساب مسجل");
    expect(notice.text).not.toMatch(/https?:\/\//);
  });

  it("the notice cannot be used to flood a mailbox: one a day for an address", async () => {
    realMail();
    await createUser({ email: "taken-flood@farqad.test" });
    for (let i = 0; i < 4; i++) await registerAction(null, registration("taken-flood@farqad.test"));
    await runAfter();
    expect(mailsTo("taken-flood@farqad.test")).toHaveLength(1);
  });

  it("two requests racing for one free address make one account and one set of consents", async () => {
    const results = await Promise.all([registerStudent(serviceInput("race@farqad.test"), META), registerStudent(serviceInput("race@farqad.test"), META)]);
    expect(results.filter((r) => r.ok && r.userId)).toHaveLength(1);
    expect(results.filter((r) => r.ok && r.userId === null)).toHaveLength(1);
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from consent_records c join users u on u.id = c.user_id where u.email = 'race@farqad.test'`;
    expect(n).toBe(3);
  });

  it("a weak password is refused on the field before any work is done", async () => {
    const res = await registerAction(null, registration("weak-pass@farqad.test", "12345678"));
    expect(res?.fieldErrors?.password).toContain("سهلة التخمين");
    expect(ctx.hashes).toBe(0);
    expect(await sql`select 1 from users where email = 'weak-pass@farqad.test'`).toHaveLength(0);
  });
});

describe("K026: the guardian step at registration", () => {
  it("is required by the service, and nothing is written without it", async () => {
    const res = await registerStudent(serviceInput("no-guardian@farqad.test", { acceptedGuardian: false }), META);
    expect(res.ok).toBe(false);
    expect(await sql`select 1 from users where email = 'no-guardian@farqad.test'`).toHaveLength(0);
  });

  it("is required by the form, and both unticked boxes are reported together", async () => {
    const fd = registration("no-boxes@farqad.test");
    fd.delete("terms");
    fd.delete("guardianAccount");
    const res = await registerAction(null, fd);
    expect(Object.keys(res?.fieldErrors ?? {}).sort()).toEqual(["guardianAccount", "terms"]);
    expect(await sql`select 1 from users where email = 'no-boxes@farqad.test'`).toHaveLength(0);
  });

  it("is written to the append-only record with its version and collects nothing about the guardian", async () => {
    const res = await registerStudent(serviceInput("guardian-row@farqad.test"), META);
    if (!res.ok || !res.userId) throw new Error("not created");
    const [row] = await sql`select document_version, order_id, ip, user_agent from consent_records where user_id = ${res.userId} and kind = 'guardian_account'`;
    expect(row).toEqual({ document_version: CONSENT_VERSIONS.guardian_account, order_id: null, ip: META.ip, user_agent: META.userAgent });
    await expect(sql`update consent_records set document_version = 'x' where user_id = ${res.userId}`).rejects.toThrow(/append-only/);
    const columns = (await sql<{ column_name: string }[]>`select column_name from information_schema.columns where table_name = 'users'`).map((c) => c.column_name);
    expect(columns.filter((c) => /guardian|birth/.test(c))).toEqual([]);
  });

  it("does not claim to verify anything", () => {
    expect(GUARDIAN_ACCOUNT_HINT).toContain("لا نتحقق");
    expect(GUARDIAN_ACCOUNT_TEXT).toContain("١٨");
  });
});

describe("K032: an account-wide ceiling on failed logins", () => {
  const wrong = (email: string, i: number) => loginWithPassword(email, `wrong-${i}`, { ip: `203.0.116.${i + 1}`, userAgent: "t" });
  const ceilingKey = (email: string) => `login:fail:${email.toLowerCase()}|*`;
  const stepBack = (key: string, seconds: number) => sql`update rate_limits set reset_at = reset_at - make_interval(secs => ${seconds}) where key = ${key}`;

  it("twenty failures from twenty addresses pass, then the account waits a minute, even for the right password", async () => {
    const u = await createUser();
    for (let i = 0; i < 20; i++) expect(await wrong(u.email, i)).toMatchObject({ ok: false, error: "البريد الإلكتروني أو كلمة المرور غير صحيحة." });
    const held = await loginWithPassword(u.email, TEST_PASSWORD, { ip: "198.51.100.61", userAgent: "t" });
    expect(held).toMatchObject({ ok: false, error: expect.stringContaining("إيقاف تسجيل الدخول مؤقتًا") });
    expect(held.ok === false && held.retryAfter).toBeLessThanOrEqual(60);
    expect(await counter(ceilingKey(u.email))).toBe(20);
  });

  it("the wait never passes five minutes, so a stranger cannot lock a student out for long", async () => {
    const u = await createUser();
    await seed(ceilingKey(u.email), 500);
    const held = await loginWithPassword(u.email, TEST_PASSWORD, { ip: "198.51.100.62", userAgent: "t" });
    expect(held.ok === false && held.retryAfter).toBeLessThanOrEqual(5 * 60);
    await stepBack(ceilingKey(u.email), 5 * 60 + 1);
    await expect(loginWithPassword(u.email, TEST_PASSWORD, { ip: "198.51.100.62", userAgent: "t" })).resolves.toMatchObject({ ok: true });
  });

  it("the wait doubles from one minute: at most one guess per five minutes once it is reached", async () => {
    const u = await createUser();
    const key = ceilingKey(u.email);
    await seed(key, 20);
    await stepBack(key, 61);
    expect(await wrong(u.email, 100)).toMatchObject({ error: expect.stringContaining("غير صحيحة") });
    const next = await wrong(u.email, 101);
    expect(next.ok === false && next.retryAfter).toBeGreaterThan(60);
    expect(next.ok === false && next.retryAfter).toBeLessThanOrEqual(120);
    expect(await counter(key)).toBe(21);
  });

  it("is forgotten after an hour without attempts", async () => {
    const u = await createUser();
    await seed(ceilingKey(u.email), 500);
    await stepBack(ceilingKey(u.email), 3601);
    await expect(loginWithPassword(u.email, TEST_PASSWORD, { ip: "198.51.100.63", userAgent: "t" })).resolves.toMatchObject({ ok: true });
  });

  it("a device that has signed in before neither waits at the ceiling nor adds to it", async () => {
    const u = await createUser();
    await seed(ceilingKey(u.email), 500);
    const proof = issueDeviceProof(u.email, TEST_ENV.APP_SECRET!);
    await expect(loginWithPassword(u.email, TEST_PASSWORD, { ip: "198.51.100.64", userAgent: "t", deviceProof: proof })).resolves.toMatchObject({ ok: true });
    expect(await counter(ceilingKey(u.email))).toBe(500);
  });

  it("the right password gives back its own slot only, so the owner's sign-in hands a guesser nothing", async () => {
    const u = await createUser();
    await seed(ceilingKey(u.email), 7);
    await expect(loginWithPassword(u.email, TEST_PASSWORD, { ip: "198.51.100.65", userAgent: "t" })).resolves.toMatchObject({ ok: true });
    expect(await counter(ceilingKey(u.email))).toBe(7);
  });

  it("a first sign-in with no earlier failures leaves no counter behind", async () => {
    const u = await createUser();
    await expect(loginWithPassword(u.email, TEST_PASSWORD, { ip: "198.51.100.66", userAgent: "t" })).resolves.toMatchObject({ ok: true });
    expect(await counter(ceilingKey(u.email))).toBeNull();
    expect(await counter(`login:fail:${u.email.toLowerCase()}|198.51.100.66`)).toBeNull();
  });

  it("an address locked on its own does not add to the account's counter, so it cannot prolong the student's wait", async () => {
    const u = await createUser();
    for (let i = 0; i < 12; i++) await loginWithPassword(u.email, `guess-${i}`, { ip: "203.0.113.70", userAgent: "t" });
    expect(await counter(ceilingKey(u.email))).toBe(5);
  });

  it("refused at the ceiling does not use up the address's own allowance", async () => {
    const u = await createUser();
    await seed(ceilingKey(u.email), 500);
    await loginWithPassword(u.email, "wrong", { ip: "203.0.113.71", userAgent: "t" });
    expect(await counter(`login:fail:${u.email.toLowerCase()}|203.0.113.71`)).toBeNull();
  });

  it("behaves the same for an address with no account", async () => {
    const email = "nobody-ceiling@farqad.test";
    for (let i = 0; i < 20; i++) await wrong(email, i);
    expect(await loginWithPassword(email, "whatever", { ip: "198.51.100.67", userAgent: "t" })).toMatchObject({ ok: false, error: expect.stringContaining("إيقاف تسجيل الدخول مؤقتًا") });
  });

  it("a reset link clears the ceiling", async () => {
    const u = await createUser();
    await seed(ceilingKey(u.email), 500);
    await sql`insert into password_reset_tokens (id, user_id, expires_at) values (${hashToken("ceiling-reset-token")}, ${u.id}, now() + interval '1 hour')`;
    await expect(resetPassword("ceiling-reset-token", "Fresh-Student-Pass-1")).resolves.toEqual({ ok: true });
    expect(await counter(ceilingKey(u.email))).toBeNull();
  });
});

describe("K103: limits per address do not lock out a shared address", () => {
  it("password resets count each account once against the address, however often it asks", async () => {
    realMail();
    const u = await createUser();
    for (let i = 0; i < 3; i++) await requestPasswordReset(u.email, "203.0.113.80");
    expect(mailsTo(u.email)).toHaveLength(3);
    expect(await counter("reset:ip:203.0.113.80")).toBe(1);
  });

  it("a hundred different accounts reach the address limit, and the next one is refused", async () => {
    realMail();
    await seed("reset:ip:203.0.113.81", 99);
    const [last, over] = [await createUser(), await createUser()];
    await requestPasswordReset(last.email, "203.0.113.81");
    await requestPasswordReset(over.email, "203.0.113.81");
    expect(mailsTo(last.email)).toHaveLength(1);
    expect(mailsTo(over.email)).toHaveLength(0);
    expect(await counter(`reset:acct:${over.email}`)).toBeNull();
  });

  it("an address over its limit gets nothing, even for an account it asked about before", async () => {
    realMail();
    await seed("reset:ip:203.0.113.85", 100);
    const u = await createUser();
    await requestPasswordReset(u.email, "203.0.113.85");
    await requestPasswordReset(u.email, "203.0.113.85");
    expect(mailsTo(u.email)).toHaveLength(0);
    expect(await counter(`reset:acct:${u.email}`)).toBeNull();
    expect(await counter(`reset:acct:${u.email}|203.0.113.85`)).toBeNull();
  });

  it("a whole class can correct its emails from one address", async () => {
    realMail();
    await seed("verify:correct:ip:203.0.113.82", 99);
    const u = await createUser();
    await expect(requestEmailCorrection(u.id, "class-new@farqad.test", TEST_PASSWORD, "203.0.113.82")).resolves.toMatchObject({ ok: true });
    await seed("verify:correct:ip:203.0.113.83", 100);
    await expect(requestEmailCorrection(u.id, "class-new-2@farqad.test", TEST_PASSWORD, "203.0.113.83")).resolves.toMatchObject({ ok: false });
  });

  it("anonymous previews leave room for a carrier's shared address", () => {
    expect(FILE_OPEN_LIMITS.perAnonymousIp).toBe(600);
  });

  it("a whole class failing to sign in counts each account once", async () => {
    const users = await Promise.all([createUser(), createUser()]);
    for (const u of users) for (let i = 0; i < 3; i++) await loginWithPassword(u.email, `typo-${i}`, { ip: "203.0.113.84", userAgent: "t" });
    expect(await counter("login:ipfail:203.0.113.84")).toBe(2);
  });
});

describe("K036: a corrected email signs out the student's other sessions", () => {
  it("the owner's correction ends every session", async () => {
    const [owner, student] = [await createUser({ role: "admin" }), await createUser()];
    await createSession(student.id);
    await createSession(student.id);
    await correctStudentEmail({ studentId: student.id, newEmail: "fixed-owner@farqad.test", adminId: owner.id, reason: "تصحيح" });
    expect(await sessionCount(student.id)).toBe(0);
  });

  it("the owner's refused correction ends nothing", async () => {
    const [owner, student, other] = [await createUser({ role: "admin" }), await createUser(), await createUser()];
    await createSession(student.id);
    await expect(correctStudentEmail({ studentId: student.id, newEmail: other.email, adminId: owner.id, reason: "تصحيح" })).rejects.toThrow();
    expect(await sessionCount(student.id)).toBe(1);
  });

  const correctionLink = async (userId: string, email: string) => {
    realMail();
    const [{ password_hash: hash }] = await sql<{ password_hash: string }[]>`select password_hash from users where id = ${userId}`;
    await sendEmailVerificationLink(userId, email, { verifiedPasswordHash: hash });
    return decodeURIComponent(/token=(\S+)/.exec(mailsTo(email).at(-1)!.text)![1]!);
  };

  it("the student's own correction keeps only the session that opened the link", async () => {
    const u = await createUser();
    const [keep, other] = [await createSession(u.id), await createSession(u.id)];
    const token = await correctionLink(u.id, "fixed-self@farqad.test");
    await expect(confirmEmailToken(token, IP, hashToken(keep.token))).resolves.toEqual({ ok: true });
    await expect(validateSessionToken(keep.token)).resolves.not.toBeNull();
    await expect(validateSessionToken(other.token)).resolves.toBeNull();
  });

  it("a link opened where the student is not signed in ends every session", async () => {
    const u = await createUser();
    await createSession(u.id);
    const token = await correctionLink(u.id, "fixed-elsewhere@farqad.test");
    await expect(confirmEmailToken(token, IP)).resolves.toEqual({ ok: true });
    expect(await sessionCount(u.id)).toBe(0);
  });

  it("the page passes the browser's own session through", async () => {
    const u = await createUser();
    const [keep, other] = [await createSession(u.id), await createSession(u.id)];
    const token = await correctionLink(u.id, "fixed-page@farqad.test");
    ctx.session = { sessionId: hashToken(keep.token), user: { id: u.id } };
    await expect(confirmEmailAction(null, form({ token }))).resolves.toMatchObject({ ok: true });
    await expect(validateSessionToken(keep.token)).resolves.not.toBeNull();
    await expect(validateSessionToken(other.token)).resolves.toBeNull();
  });

  it("confirming the address already on the account signs nobody out", async () => {
    const u = await createUser();
    await createSession(u.id);
    realMail();
    await sendEmailVerificationLink(u.id, u.email);
    const token = decodeURIComponent(/token=(\S+)/.exec(mailsTo(u.email).at(-1)!.text)![1]!);
    await expect(confirmEmailToken(token, IP)).resolves.toEqual({ ok: true });
    expect(await sessionCount(u.id)).toBe(1);
  });
});

describe("K042: deactivating a teacher is one transaction", () => {
  const teacher = async () => {
    const t = await createTeacher({ mode: "self_managed" });
    return { teacherId: t.id, userId: t.user!.id };
  };
  const seedAccess = async (userId: string) => {
    const session = await createSession(userId);
    await sql`insert into password_reset_tokens (id, user_id, expires_at) values (${hashToken(`reset-${userId}`)}, ${userId}, now() + interval '1 hour')`;
    await sql`insert into email_verification_tokens (id, user_id, email, expires_at) values (${hashToken(`verify-${userId}`)}, ${userId}, 'x@farqad.test', now() + interval '1 hour')`;
    await sql`insert into login_challenges (id, user_id, expires_at) values (${hashToken(`challenge-${userId}`)}, ${userId}, now() + interval '5 minutes')`;
    return session;
  };
  const state = async (userId: string) => {
    const [row] = await sql<{ is_active: boolean; sessions: number; resets: number; links: number; challenges: number }[]>`
      select is_active,
        (select count(*)::int from sessions s where s.user_id = u.id) as sessions,
        (select count(*)::int from password_reset_tokens t where t.user_id = u.id and t.used_at is null) as resets,
        (select count(*)::int from email_verification_tokens t where t.user_id = u.id and t.used_at is null) as links,
        (select count(*)::int from login_challenges c where c.user_id = u.id) as challenges
      from users u where u.id = ${userId}
    `;
    return row;
  };

  it("the flag, sessions, links, pending sign-ins and the audit row change together", async () => {
    const owner = await createUser({ role: "admin" });
    const { teacherId, userId } = await teacher();
    const session = await seedAccess(userId);
    await setTeacherAccountActive(teacherId, false, owner.id, "انتهى التعاقد");
    expect(await state(userId)).toEqual({ is_active: false, sessions: 0, resets: 0, links: 0, challenges: 0 });
    await expect(validateSessionToken(session.token)).resolves.toBeNull();
    expect(await auditCount("teacher.account_disable", teacherId)).toBe(1);
  });

  it("if the audit row cannot be written nothing changes", async () => {
    const { teacherId, userId } = await teacher();
    await seedAccess(userId);
    await expect(setTeacherAccountActive(teacherId, false, "00000000-0000-0000-0000-00000000dead", "سبب")).rejects.toThrow();
    expect(await state(userId)).toEqual({ is_active: true, sessions: 1, resets: 1, links: 1, challenges: 1 });
  });

  it("re-enabling leaves everything closed: the teacher signs in again", async () => {
    const owner = await createUser({ role: "admin" });
    const { teacherId, userId } = await teacher();
    const session = await seedAccess(userId);
    await setTeacherAccountActive(teacherId, false, owner.id, "سبب");
    await setTeacherAccountActive(teacherId, true, owner.id, "عاد");
    expect((await state(userId)).is_active).toBe(true);
    await expect(validateSessionToken(session.token)).resolves.toBeNull();
    expect(await auditCount("teacher.account_enable", teacherId)).toBe(1);
  });

  it("a login racing the deactivation cannot leave a session behind", async () => {
    const { userId } = await teacher();
    let racing!: Promise<string>;
    await sql.begin(async (tx) => {
      await tx`update users set is_active = false where id = ${userId}`;
      racing = createSession(userId).then(
        () => "opened",
        (err: Error) => err.name,
      );
      await new Promise((resolve) => setTimeout(resolve, 150));
    });
    await expect(racing).resolves.toBe("InactiveAccountError");
    expect(await sessionCount(userId)).toBe(0);
  });
});

describe("K030: teacher sessions have an absolute lifetime", () => {
  const teacherUser = async () => (await createTeacher({ mode: "self_managed" })).user!;

  it("a new teacher session lasts seven days, not thirty", async () => {
    const s = await createSession((await teacherUser()).id);
    const days = (s.expiresAt.getTime() - Date.now()) / 86400_000;
    expect(TEACHER_SESSION_MS).toBe(7 * 86400_000);
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThanOrEqual(7);
  });

  it("use does not extend it", async () => {
    const u = await teacherUser();
    const s = await createSession(u.id);
    await sql`update sessions set created_at = now() - interval '6 days', expires_at = now() + interval '1 day' where user_id = ${u.id}`;
    const before = (await sql<{ expires_at: Date }[]>`select expires_at from sessions where user_id = ${u.id}`)[0].expires_at;
    await expect(validateSessionToken(s.token)).resolves.not.toBeNull();
    expect((await sql<{ expires_at: Date }[]>`select expires_at from sessions where user_id = ${u.id}`)[0].expires_at).toEqual(before);
  });

  it("a thirty-day session from before this change ends at seven days from sign-in", async () => {
    const u = await teacherUser();
    const s = await createSession(u.id);
    await sql`update sessions set created_at = now() - interval '8 days', expires_at = now() + interval '22 days' where user_id = ${u.id}`;
    await expect(validateSessionToken(s.token)).resolves.toBeNull();
    expect(await sessionCount(u.id)).toBe(0);
  });

  it("students still renew", async () => {
    const u = await createUser();
    const s = await createSession(u.id);
    await sql`update sessions set expires_at = now() + interval '2 days' where user_id = ${u.id}`;
    const res = await validateSessionToken(s.token);
    expect(res!.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 86400_000);
  });
});

describe("K039: a student can ask for deletion or a copy, and the owner must act", () => {
  it("a request is recorded, audited and waits for the owner; asking twice keeps one", async () => {
    const u = await createUser({ fullName: "طالب يطلب" });
    await expect(requestAccountData({ userId: u.id, kind: "delete", ip: IP })).resolves.toMatchObject({ ok: true });
    await expect(requestAccountData({ userId: u.id, kind: "delete", ip: IP })).resolves.toMatchObject({ ok: true });
    expect(await myDataRequests(u.id)).toHaveLength(1);
    expect(await auditCount("data_request.opened", u.id)).toBe(1);
    expect(await openDataRequestCount()).toBeGreaterThanOrEqual(1);
    expect((await listOpenDataRequests()).find((r) => r.user_id === u.id)).toMatchObject({ kind: "delete", full_name: "طالب يطلب", email: u.email });
    const [row] = await sql<{ is_active: boolean; anonymized_at: Date | null }[]>`select is_active, anonymized_at from users where id = ${u.id}`;
    expect(row).toEqual({ is_active: true, anonymized_at: null });
  });

  it("is for live student accounts only", async () => {
    const teacher = await createUser({ role: "teacher" });
    await expect(requestAccountData({ userId: teacher.id, kind: "delete" })).resolves.toMatchObject({ ok: false });
    expect(await myDataRequests(teacher.id)).toHaveLength(0);
  });

  it("repeated pressing is limited", async () => {
    const u = await createUser();
    await seed(`data-request:${u.id}`, 10);
    await expect(requestAccountData({ userId: u.id, kind: "copy" })).resolves.toMatchObject({ ok: false });
    expect(await myDataRequests(u.id)).toHaveLength(0);
  });

  it("a student can withdraw their own open request and no one else's", async () => {
    const [u, other] = [await createUser(), await createUser()];
    await requestAccountData({ userId: u.id, kind: "copy" });
    const [r] = await myDataRequests(u.id);
    await expect(withdrawAccountData({ userId: other.id, requestId: r.id })).resolves.toMatchObject({ ok: false });
    await expect(withdrawAccountData({ userId: u.id, requestId: r.id })).resolves.toMatchObject({ ok: true });
    expect((await myDataRequests(u.id))[0].status).toBe("withdrawn");
    expect(await auditCount("data_request.withdrawn", u.id)).toBe(1);
    await expect(requestAccountData({ userId: u.id, kind: "copy" })).resolves.toMatchObject({ ok: true });
    expect(await myDataRequests(u.id)).toHaveLength(2);
  });

  it("a deletion cannot be marked done by hand: only the real deletion closes it", async () => {
    const [owner, u] = [await createUser({ role: "admin" }), await createUser()];
    await requestAccountData({ userId: u.id, kind: "delete" });
    const [r] = await myDataRequests(u.id);
    await expect(closeDataRequest({ requestId: r.id, adminId: owner.id, outcome: "done", note: "" })).rejects.toThrow(/نفّذ الحذف/);
    expect((await myDataRequests(u.id))[0].status).toBe("open");
    await anonymizeStudent({ studentId: u.id, adminId: owner.id, confirmEmail: u.email, reason: "بطلب الطالب" });
    const [closed] = await sql<{ status: string; closed_by: string; close_note: string | null }[]>`select status, closed_by, close_note from account_data_requests where id = ${r.id}`;
    expect(closed).toEqual({ status: "done", closed_by: owner.id, close_note: null });
  });

  it("deleting a student closes an open copy request and removes what the owner wrote", async () => {
    const [owner, u] = [await createUser({ role: "admin" }), await createUser()];
    await requestAccountData({ userId: u.id, kind: "copy" });
    await requestAccountData({ userId: u.id, kind: "delete" });
    const requests = await myDataRequests(u.id);
    const copy = requests.find((r) => r.kind === "copy")!;
    await closeDataRequest({ requestId: copy.id, adminId: owner.id, outcome: "declined", note: `تعذر لأن ${u.email} غير صحيح` });
    await requestAccountData({ userId: u.id, kind: "copy" });
    await anonymizeStudent({ studentId: u.id, adminId: owner.id, confirmEmail: u.email, reason: "بطلب الطالب" });
    const rows = await sql<{ status: string; close_note: string | null }[]>`select status, close_note from account_data_requests where user_id = ${u.id}`;
    expect(rows.some((r) => r.status === "open")).toBe(false);
    expect(rows.every((r) => r.close_note === null)).toBe(true);
  });

  it("the owner's refusal needs a reason, is shown to the student and audited, and cannot be repeated", async () => {
    const [owner, u] = [await createUser({ role: "admin" }), await createUser()];
    await requestAccountData({ userId: u.id, kind: "delete" });
    const [r] = await myDataRequests(u.id);
    await expect(closeDataRequest({ requestId: r.id, adminId: owner.id, outcome: "declined", note: "  " })).rejects.toThrow(/سبب الرفض/);
    await closeDataRequest({ requestId: r.id, adminId: owner.id, outcome: "declined", note: "لديه طلب مفتوح" });
    expect((await myDataRequests(u.id))[0]).toMatchObject({ status: "declined", close_note: "لديه طلب مفتوح" });
    expect(await auditCount("data_request.closed", u.id)).toBe(1);
    await expect(closeDataRequest({ requestId: r.id, adminId: owner.id, outcome: "declined", note: "مرة أخرى" })).rejects.toThrow(/أُغلق/);
  });

  it("a copy request can be recorded as sent, and the audit row and request change together", async () => {
    const [owner, u] = [await createUser({ role: "admin" }), await createUser()];
    await requestAccountData({ userId: u.id, kind: "copy" });
    const [r] = await myDataRequests(u.id);
    await expect(closeDataRequest({ requestId: r.id, adminId: "00000000-0000-0000-0000-00000000dead", outcome: "done", note: "" })).rejects.toThrow();
    expect((await myDataRequests(u.id))[0].status).toBe("open");
    await closeDataRequest({ requestId: r.id, adminId: owner.id, outcome: "done", note: "" });
    expect((await myDataRequests(u.id))[0].status).toBe("done");
  });

  describe("when only the audit row cannot be written", () => {
    const failAudit = async (action: string) => {
      await sql.unsafe(`create or replace function fail_audit_row() returns trigger language plpgsql as $$ begin raise exception 'audit unavailable'; end $$`);
      await sql.unsafe(`create trigger fail_audit_row before insert on audit_logs for each row when (new.action = '${action}') execute function fail_audit_row()`);
    };
    const auditBack = () => sql.unsafe(`drop trigger if exists fail_audit_row on audit_logs`);
    afterEach(auditBack);

    it("the student's request is not kept", async () => {
      const u = await createUser();
      await failAudit("data_request.opened");
      await expect(requestAccountData({ userId: u.id, kind: "delete" })).rejects.toThrow(/audit unavailable/);
      expect(await myDataRequests(u.id)).toHaveLength(0);
    });

    it("the student's withdrawal does not happen", async () => {
      const u = await createUser();
      await requestAccountData({ userId: u.id, kind: "delete" });
      const [r] = await myDataRequests(u.id);
      await failAudit("data_request.withdrawn");
      await expect(withdrawAccountData({ userId: u.id, requestId: r.id })).rejects.toThrow(/audit unavailable/);
      expect((await myDataRequests(u.id))[0].status).toBe("open");
    });

    it("the owner's decision does not happen", async () => {
      const [owner, u] = [await createUser({ role: "admin" }), await createUser()];
      await requestAccountData({ userId: u.id, kind: "copy" });
      const [r] = await myDataRequests(u.id);
      await failAudit("data_request.closed");
      await expect(closeDataRequest({ requestId: r.id, adminId: owner.id, outcome: "done", note: "" })).rejects.toThrow(/audit unavailable/);
      expect((await myDataRequests(u.id))[0].status).toBe("open");
    });
  });

  it("the owner alert holds fixed text only", () => {
    expect(OPS_ALERTS.data_request.path).toBe("/admin/students#data-requests");
  });

  describe("the student's buttons", () => {
    it("need a session and a known kind", async () => {
      await expect(requestDataAction(null, form({ kind: "delete" }))).resolves.toMatchObject({ error: expect.any(String) });
      const u = await createUser();
      ctx.user = u;
      await expect(requestDataAction(null, form({ kind: "everything" }))).resolves.toMatchObject({ error: "طلب غير صالح" });
      expect(await myDataRequests(u.id)).toHaveLength(0);
      await expect(requestDataAction(null, form({ kind: "delete" }))).resolves.toMatchObject({ ok: true });
      expect(await myDataRequests(u.id)).toHaveLength(1);
    });

    it("withdraw refuses anything that is not an id", async () => {
      ctx.user = await createUser();
      await expect(withdrawDataRequestAction(null, form({ requestId: "not-a-uuid" }))).resolves.toMatchObject({ error: "طلب غير صالح" });
    });
  });
});
