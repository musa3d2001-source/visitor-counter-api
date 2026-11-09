import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createSession, hashToken, STUDENT_ACTIVE_SESSIONS, validateSessionToken } from "@/server/auth/session";
import { loginWithPassword } from "@/server/auth/service";
import { closeDb, resetDb, sql } from "../helpers/db";
import { createUser, TEST_PASSWORD } from "../helpers/factories";

beforeEach(async () => {
  await resetDb();
});
afterAll(async () => {
  await closeDb();
});

const countSessions = async (userId: string) => (await sql<{ n: number }[]>`select count(*)::int as n from sessions where user_id = ${userId} and expires_at > now()`)[0].n;
const meta = { ip: "192.0.2.60", userAgent: "vitest" };

describe("a student's active sessions", () => {
  it("are at most three: the fourth sign-in signs out the oldest", async () => {
    const student = await createUser();
    const a = await createSession(student.id);
    const b = await createSession(student.id);
    const c = await createSession(student.id);
    const d = await createSession(student.id);
    expect(await validateSessionToken(a.token)).toBeNull();
    for (const live of [b, c, d]) expect(await validateSessionToken(live.token)).not.toBeNull();
    expect(await countSessions(student.id)).toBe(STUDENT_ACTIVE_SESSIONS);
  });

  it("applies to a real login too", async () => {
    const student = await createUser();
    const first = await loginWithPassword(student.email, TEST_PASSWORD, meta);
    if (!first.ok) throw new Error("login");
    for (let i = 0; i < 3; i++) expect((await loginWithPassword(student.email, TEST_PASSWORD, meta)).ok).toBe(true);
    expect(await validateSessionToken(first.token)).toBeNull();
    expect(await countSessions(student.id)).toBe(3);
  });

  it("removes expired sessions first, so a live one is not signed out for nothing", async () => {
    const student = await createUser();
    const live = await createSession(student.id);
    const other = await createSession(student.id);
    const expired = await createSession(student.id);
    await sql`update sessions set expires_at = now() - interval '1 minute', created_at = now() + interval '1 hour' where id = ${hashToken(expired.token)}`;
    await createSession(student.id);
    expect(await validateSessionToken(live.token)).not.toBeNull();
    expect(await validateSessionToken(other.token)).not.toBeNull();
    expect(await sql`select 1 from sessions where id = ${hashToken(expired.token)}`).toHaveLength(0);
  });

  it("never exceed three under concurrency, at any moment", async () => {
    const student = await createUser();
    let peak = 0;
    let sampling = true;
    // قارئ على اتصال منفصل يعيّن العدد أثناء الدخول المتزامن
    const sampler = (async () => {
      while (sampling) {
        peak = Math.max(peak, await countSessions(student.id));
        await new Promise((r) => setTimeout(r, 2));
      }
    })();
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => createSession(student.id, { ip: `192.0.2.${i}` })));
    sampling = false;
    await sampler;
    expect(results).toHaveLength(20);
    expect(peak).toBeLessThanOrEqual(3);
    expect(await countSessions(student.id)).toBe(3);
  });

  it("keeps the three sessions that signed in last, under concurrency", async () => {
    const student = await createUser();
    const results = await Promise.all(Array.from({ length: 10 }, () => createSession(student.id)));
    const alive = await Promise.all(results.map((r) => validateSessionToken(r.token)));
    const survivors = results.filter((_, i) => alive[i]);
    const evicted = results.filter((_, i) => !alive[i]);
    expect(survivors).toHaveLength(3);
    // expiresAt يُحسب بعد الحصول على قفل الحساب، فترتيبه هو ترتيب الدخول الفعلي، بخلاف ترتيب بدء الطلبات
    const oldestSurvivor = Math.min(...survivors.map((r) => r.expiresAt.getTime()));
    const newestEvicted = Math.max(...evicted.map((r) => r.expiresAt.getTime()));
    expect(oldestSurvivor).toBeGreaterThanOrEqual(newestEvicted);
  });

  it("orders sessions by who got the lock, not by who started first", async () => {
    const student = await createUser();
    let release!: () => void;
    let locked!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const isLocked = new Promise<void>((r) => (locked = r));
    const holder = sql.begin(async (tx) => {
      await tx`select id from users where id = ${student.id} for no key update`;
      locked();
      await gate;
    });
    await isLocked;
    // هذا الدخول يبدأ معاملته الآن وينتظر القفل
    const waiting = createSession(student.id);
    await new Promise((r) => setTimeout(r, 150));
    const [between] = await sql<{ created_at: Date }[]>`
      insert into sessions (id, user_id, expires_at, created_at) values (${"b".repeat(64)}, ${student.id}, now() + interval '1 day', clock_timestamp()) returning created_at
    `;
    release();
    await holder;
    const { token } = await waiting;
    const [last] = await sql<{ created_at: Date }[]>`select created_at from sessions where id = ${hashToken(token)}`;
    expect(new Date(last.created_at).getTime()).toBeGreaterThan(new Date(between.created_at).getTime());
  });

  it("does not touch another student", async () => {
    const a = await createUser();
    const b = await createUser();
    const keep = await createSession(b.id);
    for (let i = 0; i < 4; i++) await createSession(a.id);
    expect(await validateSessionToken(keep.token)).not.toBeNull();
  });

  it("does not apply to teachers or admins", async () => {
    for (const role of ["teacher", "admin"] as const) {
      const user = await createUser({ role });
      for (let i = 0; i < 5; i++) await createSession(user.id);
      expect(await countSessions(user.id)).toBe(5);
    }
  });
});
