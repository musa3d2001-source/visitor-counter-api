import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { resetEnvCache } from "@/server/env";
import { enableTeacherAccount, resetTeacherPassword } from "@/server/admin/teachers";
import { confirmEmailToken, requestEmailCorrection } from "@/server/auth/email-verification";
import { completeForcedPasswordChange, loginWithPassword, resetPassword } from "@/server/auth/service";
import { createSession, hashToken, validateSessionToken } from "@/server/auth/session";
import { startSmtpSink, type SmtpSink } from "../mocks/smtp-sink";
import { closeDb, resetDb, sql } from "../helpers/db";
import { createTeacher, createUser, TEST_PASSWORD } from "../helpers/factories";
import { TEST_ENV } from "../test-env";

const ctx = vi.hoisted(() => ({ session: null as unknown, cookie: null as null | { token: string } }));
vi.mock("next/navigation", async (original) => ({
  ...(await original<typeof import("next/navigation")>()),
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
}));
vi.mock("@/server/http", async (original) => ({ ...(await original<typeof import("@/server/http")>()), clientIp: async () => "192.0.2.70", userAgent: async () => "t" }));
vi.mock("@/server/auth/session", async (original) => ({
  ...(await original<typeof import("@/server/auth/session")>()),
  getCurrentSession: async () => ctx.session,
  setSessionCookie: async (token: string) => {
    ctx.cookie = { token };
  },
}));

const { default: ChangePasswordPage } = await import("@/app/(site)/(auth)/change-password/page");
const { changeTemporaryPasswordAction } = await import("@/app/(site)/(auth)/actions");

const META = { ip: "192.0.2.71", userAgent: "t" };
const CHOSEN = "Teacher-Chosen-Pass-2026";
let sink: SmtpSink;
let ownerId: string;

beforeAll(async () => {
  await resetDb();
  sink = await startSmtpSink();
  ownerId = (await createUser({ role: "admin" })).id;
});
afterAll(async () => {
  await sink.close();
  await closeDb();
});
beforeEach(() => {
  sink.clear();
  return sql`delete from rate_limits`;
});
afterEach(() => {
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_PORT;
  delete process.env.MAIL_FROM;
  for (const [k, v] of Object.entries(TEST_ENV)) process.env[k] = v;
  resetEnvCache();
});

function realMail() {
  process.env.MAIL_DRIVER = "smtp";
  process.env.SMTP_HOST = "127.0.0.1";
  process.env.SMTP_PORT = String(sink.port);
  process.env.MAIL_FROM = "no-reply@farqad.test";
  resetEnvCache();
}

const account = async (id: string) =>
  (
    await sql<{ role: string; is_active: boolean; must_change_password: boolean; temp_password_expires_at: Date | null; password_hash: string }[]>`
      select role, is_active, must_change_password, temp_password_expires_at, password_hash from users where id = ${id}
    `
  )[0];
const hoursAhead = (d: Date | null) => (new Date(d!).getTime() - Date.now()) / 3_600_000;
const uniqueEmail = (label: string) => `${label}-${Math.random().toString(36).slice(2, 10)}@farqad.test`;

describe("a new teacher account (D17)", () => {
  it("starts on a one-time temporary password valid for 24 hours", async () => {
    const t = await createTeacher();
    const email = uniqueEmail("new-teacher");
    const res = await enableTeacherAccount(t.id, { email, fullName: "معلم جديد" }, ownerId, "192.0.2.1");
    expect(res).toMatchObject({ email, linkedExisting: false, noticeSent: false });
    const [row] = await sql<{ id: string }[]>`select id from users where email = ${email}`;
    const a = await account(row.id);
    expect(a).toMatchObject({ role: "teacher", must_change_password: true });
    expect(hoursAhead(a.temp_password_expires_at)).toBeGreaterThan(23.9);
    expect(hoursAhead(a.temp_password_expires_at)).toBeLessThanOrEqual(24.01);

    const first = await loginWithPassword(email, res.password, META);
    expect(first).toMatchObject({ ok: true, mustChangePassword: true });
    expect((await loginWithPassword(email, res.password, META)).ok).toBe(false);
  });

  it("the temporary password stops working after its 24 hours", async () => {
    const t = await createTeacher();
    const email = uniqueEmail("late-teacher");
    const res = await enableTeacherAccount(t.id, { email, fullName: "معلم" }, ownerId);
    await sql`update users set temp_password_expires_at = now() - interval '1 second' where email = ${email}`;
    expect((await loginWithPassword(email, res.password, META)).ok).toBe(false);
  });

  it("the audit entry names the account by id and never holds its address", async () => {
    const t = await createTeacher();
    const email = uniqueEmail("audited-teacher");
    await enableTeacherAccount(t.id, { email, fullName: "معلم" }, ownerId, "192.0.2.2");
    const [row] = await sql<{ metadata: Record<string, unknown>; actor_id: string; ip: string }[]>`select metadata, actor_id, ip from audit_logs where entity_id = ${t.id} and action = 'teacher.mode_self_managed'`;
    expect(row.actor_id).toBe(ownerId);
    expect(row.ip).toBe("192.0.2.2");
    expect(row.metadata).toMatchObject({ linkedExisting: false });
    expect(JSON.stringify(row.metadata)).not.toContain(email);
  });

  it("first login goes to the password page, which holds a teacher to twelve characters", async () => {
    const t = await createTeacher({ mode: "self_managed" });
    await sql`update users set must_change_password = true where id = ${t.user!.id}`;
    const s = await createSession(t.user!.id);
    ctx.session = await validateSessionToken(s.token);
    const html = renderToStaticMarkup(await ChangePasswordPage());
    expect(html).toContain("١٢ حرفًا على الأقل");
    expect(html).toContain('minLength="12"');
    expect(html).not.toContain("٨ أحرف على الأقل");
  });

  it("a student on the same page keeps the eight character hint", async () => {
    const u = await createUser();
    await sql`update users set must_change_password = true where id = ${u.id}`;
    const s = await createSession(u.id);
    ctx.session = await validateSessionToken(s.token);
    const html = renderToStaticMarkup(await ChangePasswordPage());
    expect(html).toContain("٨ أحرف على الأقل");
    expect(html).toContain('minLength="8"');
  });

  it("after choosing a password the teacher lands on the dashboard, and the student in the library", async () => {
    const form = () => {
      const f = new FormData();
      f.set("password", CHOSEN);
      f.set("passwordConfirm", CHOSEN);
      return f;
    };
    const t = await createTeacher({ mode: "self_managed" });
    await sql`update users set must_change_password = true where id = ${t.user!.id}`;
    ctx.session = await validateSessionToken((await createSession(t.user!.id)).token);
    await expect(changeTemporaryPasswordAction(null, form())).rejects.toThrow("NEXT_REDIRECT /admin");
    const u = await createUser();
    await sql`update users set must_change_password = true where id = ${u.id}`;
    ctx.session = await validateSessionToken((await createSession(u.id)).token);
    await expect(changeTemporaryPasswordAction(null, form())).rejects.toThrow("NEXT_REDIRECT /library");
  });
});

describe("resetting a teacher's password (D17)", () => {
  async function teacherWithAccess() {
    const t = await createTeacher({ mode: "self_managed" });
    const user = t.user!;
    const session = await createSession(user.id);
    const reset = `teacher-reset-link-${Math.random().toString(36).slice(2)}-xxxxxxxx`;
    await sql`insert into password_reset_tokens (id, user_id, expires_at) values (${hashToken(reset)}, ${user.id}, now() + interval '1 hour')`;
    return { t, user, session, reset };
  }

  it("issues a one-time password, must be changed, and closes everything older", async () => {
    const { t, user, session, reset } = await teacherWithAccess();
    await sql`insert into rate_limits (key, count, reset_at) values (${`login:fail:${user.email.toLowerCase()}|203.0.113.4`}, 4, now() + interval '1 hour')`;
    const password = await resetTeacherPassword(t.id, ownerId, "192.0.2.3");

    const a = await account(user.id);
    expect(a.must_change_password).toBe(true);
    expect(hoursAhead(a.temp_password_expires_at)).toBeGreaterThan(23.9);
    expect(await validateSessionToken(session.token)).toBeNull();
    expect((await loginWithPassword(user.email, TEST_PASSWORD, META)).ok).toBe(false);
    expect((await resetPassword(reset, CHOSEN)).ok).toBe(false);
    expect(await sql`select 1 from rate_limits where key = ${`login:fail:${user.email.toLowerCase()}|203.0.113.4`}`).toHaveLength(0);

    expect(await loginWithPassword(user.email, password, META)).toMatchObject({ ok: true, mustChangePassword: true });
    expect((await loginWithPassword(user.email, password, META)).ok).toBe(false);
    const [row] = await sql<{ actor_id: string; ip: string }[]>`select actor_id, ip from audit_logs where entity_id = ${t.id} and action = 'teacher.password_reset'`;
    expect(row).toEqual({ actor_id: ownerId, ip: "192.0.2.3" });
  });

  it("a teacher choosing a new password is held to the staff rules", async () => {
    const { t, user } = await teacherWithAccess();
    await resetTeacherPassword(t.id, ownerId);
    expect(await completeForcedPasswordChange(user.id, "Short-Pass1", META)).toMatchObject({ ok: false, field: "password" });
    expect((await completeForcedPasswordChange(user.id, CHOSEN, META)).ok).toBe(true);
    expect(await account(user.id)).toMatchObject({ must_change_password: false, temp_password_expires_at: null });
  });

  it("voids a pending email link", async () => {
    realMail();
    const { t, user } = await teacherWithAccess();
    await requestEmailCorrection(user.id, "teacher-new@farqad.test", TEST_PASSWORD, "192.0.2.4");
    const mail = sink.messages.filter((m) => m.to.includes("teacher-new@farqad.test")).at(-1)!;
    const token = decodeURIComponent(/verify-email\/confirm\?token=(\S+)/.exec(mail.text)![1]!);
    await resetTeacherPassword(t.id, ownerId);
    expect((await confirmEmailToken(token, "192.0.2.4")).ok).toBe(false);
  });

  it("is rate limited per account", async () => {
    const { t } = await teacherWithAccess();
    for (let i = 0; i < 5; i++) await resetTeacherPassword(t.id, ownerId);
    await expect(resetTeacherPassword(t.id, ownerId)).rejects.toThrow("محاولات كثيرة");
  });

  it("refuses a teacher with no login", async () => {
    const t = await createTeacher();
    await expect(resetTeacherPassword(t.id, ownerId)).rejects.toThrow("لا يوجد حساب دخول");
  });
});

describe("upgrading an existing student to teacher (D17)", () => {
  it("is refused without the owner's explicit confirmation, and changes nothing", async () => {
    const [t, student] = await Promise.all([createTeacher(), createUser()]);
    const before = await account(student.id);
    await expect(enableTeacherAccount(t.id, { email: student.email, fullName: "طالب" }, ownerId)).rejects.toThrow("فلن تتم ترقيته دون موافقتك");
    expect(await account(student.id)).toEqual(before);
    const [row] = await sql<{ mode: string; user_id: string | null }[]>`select mode, user_id from teachers where id = ${t.id}`;
    expect(row).toEqual({ mode: "managed", user_id: null });
    expect(await sql`select 1 from audit_logs where entity_id = ${t.id} and action = 'teacher.mode_self_managed'`).toHaveLength(0);
  });

  it("replaces the password, so whoever registered that address cannot use it", async () => {
    const [t, student] = await Promise.all([createTeacher(), createUser()]);
    const session = await createSession(student.id);
    const res = await enableTeacherAccount(t.id, { email: student.email, fullName: "طالب", confirmLinkExisting: true }, ownerId);
    expect(res.linkedExisting).toBe(true);
    expect(res.password.length).toBeGreaterThanOrEqual(12);
    expect(await account(student.id)).toMatchObject({ role: "teacher", must_change_password: true });
    expect(await validateSessionToken(session.token)).toBeNull();
    expect((await loginWithPassword(student.email, TEST_PASSWORD, META)).ok).toBe(false);
    expect(await loginWithPassword(student.email, res.password, META)).toMatchObject({ ok: true, mustChangePassword: true });
  });

  it("voids reset links and pending email links", async () => {
    realMail();
    const [t, student] = await Promise.all([createTeacher(), createUser()]);
    const reset = "student-reset-link-before-upgrade-xxxxxxxx";
    await sql`insert into password_reset_tokens (id, user_id, expires_at) values (${hashToken(reset)}, ${student.id}, now() + interval '1 hour')`;
    await requestEmailCorrection(student.id, "elsewhere-before-upgrade@farqad.test", TEST_PASSWORD, "192.0.2.5");
    const mail = sink.messages.filter((m) => m.to.includes("elsewhere-before-upgrade@farqad.test")).at(-1)!;
    const token = decodeURIComponent(/verify-email\/confirm\?token=(\S+)/.exec(mail.text)![1]!);
    await enableTeacherAccount(t.id, { email: student.email, fullName: "طالب", confirmLinkExisting: true }, ownerId);
    expect((await resetPassword(reset, CHOSEN)).ok).toBe(false);
    expect((await confirmEmailToken(token, "192.0.2.5")).ok).toBe(false);
  });

  it("does not reactivate a suspended account", async () => {
    const [t, student] = await Promise.all([createTeacher(), createUser()]);
    await sql`update users set is_active = false where id = ${student.id}`;
    await enableTeacherAccount(t.id, { email: student.email, fullName: "طالب", confirmLinkExisting: true }, ownerId);
    expect(await account(student.id)).toMatchObject({ role: "teacher", is_active: false });
  });

  it("emails the account with no password in it, and reports that it went out", async () => {
    realMail();
    const [t, student] = await Promise.all([createTeacher(), createUser()]);
    const res = await enableTeacherAccount(t.id, { email: student.email, fullName: "طالب", confirmLinkExisting: true }, ownerId);
    expect(res.noticeSent).toBe(true);
    const [notice] = sink.messages.filter((m) => m.to.includes(student.email));
    expect(notice!.subject).toContain("حساب معلم");
    expect(notice!.text).not.toContain(res.password);
  });

  it("tells the owner when the notice could not be sent, and the upgrade still stands", async () => {
    realMail();
    const [t, student] = await Promise.all([createTeacher(), createUser()]);
    sink.rejectNext();
    const res = await enableTeacherAccount(t.id, { email: student.email, fullName: "طالب", confirmLinkExisting: true }, ownerId);
    expect(res.noticeSent).toBe(false);
    expect((await account(student.id)).role).toBe("teacher");
  });

  it("never uses the owner's account, a deleted account, or another teacher's", async () => {
    const [t, admin, other] = await Promise.all([createTeacher(), createUser({ role: "admin" }), createTeacher({ mode: "self_managed" })]);
    await expect(enableTeacherAccount(t.id, { email: admin.email, fullName: "مالك", confirmLinkExisting: true }, ownerId)).rejects.toThrow("حساب المالك");
    await expect(enableTeacherAccount(t.id, { email: other.user!.email, fullName: "معلم", confirmLinkExisting: true }, ownerId)).rejects.toThrow("مرتبط بمعلم آخر");
    const gone = await createUser();
    const placeholder = `deleted-${gone.id}@anonymized.invalid`;
    await sql`update users set email = ${placeholder}, full_name = ${`طالب محذوف ${gone.id.slice(0, 8)}`}, phone = null, grade_id = null, password_hash = '!anonymized', is_active = false, anonymized_at = now() where id = ${gone.id}`;
    await expect(enableTeacherAccount(t.id, { email: placeholder, fullName: "محذوف", confirmLinkExisting: true }, ownerId)).rejects.toThrow("حُذفت بيانات");
  });
});
