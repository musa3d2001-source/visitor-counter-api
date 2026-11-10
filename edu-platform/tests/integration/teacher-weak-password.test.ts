import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { completeForcedPasswordChange, loginWithPassword } from "@/server/auth/service";
import { hashPassword } from "@/server/auth/password-core";
import { createSession, validateSessionToken } from "@/server/auth/session";
import { closeDb, resetDb, sql } from "../helpers/db";
import { createTeacher, createUser, TEST_PASSWORD, type TestTeacher } from "../helpers/factories";
import { provenOwner } from "../helpers/step-up";

const ctx = vi.hoisted(() => ({ user: null as unknown, session: null as unknown }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", async (original) => ({
  ...(await original<typeof import("next/navigation")>()),
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
}));
vi.mock("@/server/http", async (original) => ({ ...(await original<typeof import("@/server/http")>()), clientIp: async () => "192.0.2.75", userAgent: async () => "t" }));
vi.mock("@/server/auth/session", async (original) => ({
  ...(await original<typeof import("@/server/auth/session")>()),
  getCurrentUser: async () => ctx.user,
  getCurrentSession: async () => ctx.session,
}));

const { default: ChangePasswordPage } = await import("@/app/(site)/(auth)/change-password/page");
const { resetPasswordAction } = await import("@/app/admin/teachers/actions");

const META = { ip: "192.0.2.76", userAgent: "t" };
const WEAK = "short123";
const CHOSEN = "Teacher-Chosen-Pass-2026";
let ownerId: string;
let ownerEmail: string;

const setPassword = async (userId: string, password: string) => sql`update users set password_hash = ${await hashPassword(password)} where id = ${userId}`;
const teacherWith = async (password: string): Promise<TestTeacher> => {
  const t = await createTeacher({ mode: "self_managed" });
  await setPassword(t.user!.id, password);
  return t;
};
const flags = async (userId: string) => (await sql<{ must_change_password: boolean; temp_password_expires_at: Date | null }[]>`select must_change_password, temp_password_expires_at from users where id = ${userId}`)[0];
const form = (values: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
};
const staffSession = (id: string, email: string, role: "teacher" | "admin") => ({ id, email, fullName: "س", phone: null, role, gradeId: null, isActive: true });

beforeAll(async () => {
  await resetDb();
  const owner = await createUser({ role: "admin" });
  ownerId = owner.id;
  ownerEmail = owner.email;
});
afterAll(closeDb);
beforeEach(async () => {
  ctx.user = null;
  ctx.session = null;
  await sql`delete from rate_limits`;
});

describe("a teacher whose password is below the staff rules (D17)", () => {
  it("only reaches the password page at login, whichever way the password fell short", async () => {
    for (const password of [WEAK, "password-12345"]) {
      const t = await teacherWith(password);
      const res = await loginWithPassword(t.user!.email, password, META);
      expect(res).toMatchObject({ ok: true, mustChangePassword: true });
      const session = await validateSessionToken((res as { token: string }).token);
      expect(session?.mustChangePassword).toBe(true);
      expect(await flags(t.user!.id)).toEqual({ must_change_password: true, temp_password_expires_at: null });
    }
  });

  it("a student linked as a teacher the old way, with their student password, is held the same", async () => {
    const student = await createUser();
    await setPassword(student.id, WEAK);
    const t = await createTeacher();
    await sql`update users set role = 'teacher' where id = ${student.id}`;
    await sql`update teachers set mode = 'self_managed', user_id = ${student.id} where id = ${t.id}`;
    expect(await loginWithPassword(student.email, WEAK, META)).toMatchObject({ ok: true, mustChangePassword: true });
  });

  it("can log in again and is still held there, since this is not a one-time password", async () => {
    const t = await teacherWith(WEAK);
    await loginWithPassword(t.user!.email, WEAK, META);
    expect(await loginWithPassword(t.user!.email, WEAK, META)).toMatchObject({ ok: true, mustChangePassword: true });
  });

  it("must choose a password that meets the rules, and then logs in normally", async () => {
    const t = await teacherWith(WEAK);
    await loginWithPassword(t.user!.email, WEAK, META);
    expect(await completeForcedPasswordChange(t.user!.id, "short456", META)).toMatchObject({ ok: false, field: "password" });
    expect(await completeForcedPasswordChange(t.user!.id, CHOSEN, META)).toMatchObject({ ok: true });
    expect(await flags(t.user!.id)).toEqual({ must_change_password: false, temp_password_expires_at: null });
    const res = await loginWithPassword(t.user!.email, CHOSEN, META);
    expect(res.ok).toBe(true);
    expect((res as { mustChangePassword?: boolean }).mustChangePassword).toBeFalsy();
    expect(await loginWithPassword(t.user!.email, WEAK, META)).toMatchObject({ ok: false });
  });

  it("is written to the audit log, without the password", async () => {
    const t = await teacherWith(WEAK);
    await loginWithPassword(t.user!.email, WEAK, META);
    const rows = await sql<{ actor_id: string; ip: string; metadata: unknown }[]>`select actor_id, ip, metadata from audit_logs where entity_id = ${t.user!.id} and action = 'user.password_below_staff_policy'`;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actor_id: t.user!.id, ip: META.ip });
    expect(JSON.stringify(rows[0].metadata)).not.toContain(WEAK);
  });

  it("is told what is asked, and not that the password was temporary", async () => {
    const t = await teacherWith(WEAK);
    ctx.session = { user: staffSession(t.user!.id, t.user!.email, "teacher"), mustChangePassword: true, needsTwoFactorEnrolment: false };
    const html = renderToStaticMarkup(await ChangePasswordPage());
    expect(html).toContain("١٢ حرفًا على الأقل");
    expect(html).not.toContain("مؤقتة");
  });

  it("a one-time temporary password keeps working once, unchanged by this check", async () => {
    const t = await teacherWith(WEAK);
    await sql`update users set must_change_password = true, temp_password_expires_at = now() + interval '1 hour' where id = ${t.user!.id}`;
    expect(await loginWithPassword(t.user!.email, WEAK, META)).toMatchObject({ ok: true, mustChangePassword: true });
    expect(await loginWithPassword(t.user!.email, WEAK, META)).toMatchObject({ ok: false });
  });
});

describe("who this check leaves alone", () => {
  it("a teacher with a good password", async () => {
    const t = await teacherWith(TEST_PASSWORD);
    const res = await loginWithPassword(t.user!.email, TEST_PASSWORD, META);
    expect(res.ok).toBe(true);
    expect((res as { mustChangePassword?: boolean }).mustChangePassword).toBeFalsy();
    expect((await flags(t.user!.id)).must_change_password).toBe(false);
  });

  it("a student with eight characters", async () => {
    const u = await createUser();
    await setPassword(u.id, WEAK);
    const res = await loginWithPassword(u.email, WEAK, META);
    expect(res.ok).toBe(true);
    expect((await flags(u.id)).must_change_password).toBe(false);
  });

  it("an owner account", async () => {
    await setPassword(ownerId, WEAK);
    await loginWithPassword(ownerEmail, WEAK, META);
    expect((await flags(ownerId)).must_change_password).toBe(false);
    await setPassword(ownerId, TEST_PASSWORD);
  });

  it("a wrong password flags nothing", async () => {
    const t = await teacherWith(WEAK);
    expect(await loginWithPassword(t.user!.email, "short124", META)).toMatchObject({ ok: false });
    expect((await flags(t.user!.id)).must_change_password).toBe(false);
  });
});

describe("the one-time end of sessions in the migration", () => {
  const statement = () => {
    const file = readFileSync(path.join(process.cwd(), "db/migrations/0012_content_teachers.sql"), "utf8");
    const found = file.match(/^delete from sessions[^;]*;/m);
    expect(found).not.toBeNull();
    return found![0];
  };

  it("ends teacher sessions and no others", async () => {
    const t = await teacherWith(WEAK);
    const student = await createUser();
    const owner = await createSession(ownerId);
    const teacherSession = await createSession(t.user!.id);
    const studentSession = await createSession(student.id);
    await sql.unsafe(statement());
    expect(await validateSessionToken(teacherSession.token)).toBeNull();
    expect(await validateSessionToken(studentSession.token)).not.toBeNull();
    expect(await validateSessionToken(owner.token)).not.toBeNull();
  });
});

describe("the owner's reset of a teacher password", () => {
  it("needs the acknowledgement, on the server, and changes nothing without it", async () => {
    const t = await teacherWith(TEST_PASSWORD);
    ctx.user = staffSession(ownerId, ownerEmail, "admin");
    const res = await resetPasswordAction(null, form({ teacherId: t.id }));
    expect(res?.error).toContain("أكّد");
    expect((await flags(t.user!.id)).must_change_password).toBe(false);
    expect(await loginWithPassword(t.user!.email, TEST_PASSWORD, META)).toMatchObject({ ok: true });
  });

  it("ends in the secret, as the one-time panel expects to read it", async () => {
    const t = await teacherWith(TEST_PASSWORD);
    ctx.user = staffSession(ownerId, ownerEmail, "admin");
    ctx.session = { user: ctx.user, sessionId: (await provenOwner({ id: ownerId, email: ownerEmail })).sessionId, mustChangePassword: false, needsTwoFactorEnrolment: false };
    const res = await resetPasswordAction(null, form({ teacherId: t.id, confirmReset: "on" }));
    expect(res?.ok).toBe(true);
    const secret = res?.message?.match(/:\s*(\S+)$/)?.[1];
    expect(secret?.length).toBeGreaterThanOrEqual(12);
    expect(await loginWithPassword(t.user!.email, secret!, META)).toMatchObject({ ok: true, mustChangePassword: true });
  });

  it("is refused to a teacher, even with the tick", async () => {
    const t = await teacherWith(TEST_PASSWORD);
    const victim = await teacherWith(TEST_PASSWORD);
    ctx.user = staffSession(t.user!.id, t.user!.email, "teacher");
    const res = await resetPasswordAction(null, form({ teacherId: victim.id, confirmReset: "on" }));
    expect(res?.ok).toBeFalsy();
    expect((await flags(victim.user!.id)).must_change_password).toBe(false);
  });
});
