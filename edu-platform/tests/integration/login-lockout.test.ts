import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loginWithPassword, resetPassword } from "@/server/auth/service";
import { reserveFailureSlot } from "@/server/auth/rate-limit";
import { hashToken } from "@/server/auth/session";
import { closeDb, resetDb, sql } from "../helpers/db";
import { createUser, TEST_PASSWORD } from "../helpers/factories";

/** نتجسس على الحرق الزمني دون تغييره: قياس الزمن نفسه لا يصلح في اختبار */
const burnt = vi.hoisted(() => ({ passwords: [] as string[] }));
vi.mock("@/server/auth/password", async (original) => {
  const actual = await original<typeof import("@/server/auth/password")>();
  return {
    ...actual,
    burnPasswordTime: async (password: string) => {
      burnt.passwords.push(password);
      return actual.burnPasswordTime(password);
    },
  };
});

beforeAll(resetDb);
afterAll(closeDb);

const meta = (ip: string) => ({ ip, userAgent: "vitest" });
const wrong = (email: string, ip: string, password = "wrong-password") => loginWithPassword(email, password, meta(ip));
const right = (email: string, ip: string) => loginWithPassword(email, TEST_PASSWORD, meta(ip));
const LOCKED = "تم إيقاف تسجيل الدخول مؤقتًا";
const pair = (email: string, ip: string) => `login:fail:${email.toLowerCase()}|${ip}`;

/** تمر مدة الانتظار دون انتظار فعلي: نرجع وقت آخر محاولة إلى الوراء */
async function ageLastAttempt(key: string, seconds: number) {
  await sql`update rate_limits set reset_at = reset_at - make_interval(secs => ${seconds}) where key = ${key}`;
}

describe("login lockout counts failures only", () => {
  it("many successful logins never count, whatever the number", async () => {
    const u = await createUser();
    for (let i = 0; i < 12; i++) expect((await right(u.email, "198.51.100.1")).ok, `login ${i}`).toBe(true);
    expect(await sql`select 1 from rate_limits where key = ${pair(u.email, "198.51.100.1")}`).toHaveLength(0);
  });

  it("a correct password wipes earlier failures", async () => {
    const u = await createUser();
    const ip = "198.51.100.2";
    for (let i = 0; i < 4; i++) await wrong(u.email, ip);
    expect((await right(u.email, ip)).ok).toBe(true);
    // العدّاد بدأ من جديد: خمسة أخطاء أخرى بلا إيقاف
    for (let i = 0; i < 5; i++) {
      const r = await wrong(u.email, ip);
      expect(r).toEqual({ ok: false, error: "البريد الإلكتروني أو كلمة المرور غير صحيحة." });
    }
    const [{ count }] = await sql<{ count: number }[]>`select count from rate_limits where key = ${pair(u.email, ip)}`;
    expect(count).toBe(5);
  });

  it("five wrong passwords are free, the sixth attempt waits, even with the right password", async () => {
    const u = await createUser();
    const ip = "198.51.100.3";
    for (let i = 0; i < 5; i++) {
      const r = await wrong(u.email, ip);
      expect(r).toEqual({ ok: false, error: "البريد الإلكتروني أو كلمة المرور غير صحيحة." });
    }
    const blocked = await right(u.email, ip);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.error).toContain(LOCKED);
      expect(blocked.error).toContain("المدة المتبقية: أقل من دقيقة");
      expect(blocked.retryAfter).toBeGreaterThan(0);
      expect(blocked.retryAfter).toBeLessThanOrEqual(30);
    }
  });

  it("the wait doubles with each further failure and stops at fifteen minutes", async () => {
    const key = "test:progressive";
    const policy = { freeFailures: 5, firstDelaySeconds: 30, maxDelaySeconds: 900, forgetAfterSeconds: 3600 };
    for (let i = 0; i < 5; i++) expect((await reserveFailureSlot(key, policy)).allowed).toBe(true);
    const seen: number[] = [];
    for (const expected of [30, 60, 120, 240, 480, 900, 900]) {
      const blocked = await reserveFailureSlot(key, policy);
      if (blocked.allowed) throw new Error("expected a wait");
      seen.push(blocked.retryAfterSeconds);
      expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(expected);
      expect(blocked.retryAfterSeconds).toBeGreaterThan(expected - 3);
      // يبقى المنع إلى نهاية هذه المدة بعينها، لا المدة الأولى فقط
      await ageLastAttempt(key, expected - 5);
      expect((await reserveFailureSlot(key, policy)).allowed, `still waiting at ${expected}`).toBe(false);
      await ageLastAttempt(key, 5);
      expect((await reserveFailureSlot(key, policy)).allowed, `open after ${expected}`).toBe(true);
    }
    expect(seen).toHaveLength(7);
  });

  it("a refused attempt does not lengthen the wait", async () => {
    const key = "test:no-extend";
    const policy = { freeFailures: 1, firstDelaySeconds: 30, maxDelaySeconds: 900, forgetAfterSeconds: 3600 };
    await reserveFailureSlot(key, policy);
    const [before] = await sql<{ count: number; reset_at: Date }[]>`select count, reset_at from rate_limits where key = ${key}`;
    for (let i = 0; i < 5; i++) expect((await reserveFailureSlot(key, policy)).allowed).toBe(false);
    const [after] = await sql<{ count: number; reset_at: Date }[]>`select count, reset_at from rate_limits where key = ${key}`;
    expect(after).toEqual(before);
  });

  it("failures are forgotten after an hour of quiet", async () => {
    const u = await createUser();
    const ip = "198.51.100.4";
    for (let i = 0; i < 5; i++) await wrong(u.email, ip);
    await sql`update rate_limits set reset_at = now() - interval '1 second' where key = ${pair(u.email, ip)}`;
    expect((await right(u.email, ip)).ok).toBe(true);
  });

  it("a parallel burst cannot try more than the free failures", async () => {
    const u = await createUser();
    const ip = "198.51.100.5";
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => wrong(u.email, ip, `burst-${i}`)));
    const checked = results.filter((r) => !r.ok && r.error === "البريد الإلكتروني أو كلمة المرور غير صحيحة.");
    expect(checked).toHaveLength(5);
    expect(results.filter((r) => !r.ok && r.error.includes(LOCKED))).toHaveLength(7);
  });
});

describe("who can lock whom", () => {
  it("an attacker on another network cannot lock a known account", async () => {
    const victim = await createUser();
    for (let i = 0; i < 30; i++) await wrong(victim.email, "203.0.113.200");
    expect((await right(victim.email, "198.51.100.10")).ok).toBe(true);
  });

  it("a classmate behind the same school IP cannot lock your account", async () => {
    const student = await createUser();
    const classmate = await createUser();
    const school = "198.51.100.11";
    for (let i = 0; i < 8; i++) await wrong(classmate.email, school);
    expect((await right(student.email, school)).ok).toBe(true);
    const blockedClassmate = await right(classmate.email, school);
    expect(blockedClassmate.ok).toBe(false);
  });

  it("a whole class mistyping several times does not reach the IP limit", async () => {
    const school = "198.51.100.12";
    const classOf40 = await Promise.all(Array.from({ length: 40 }, () => createUser()));
    for (const s of classOf40) for (let i = 0; i < 3; i++) await wrong(s.email, school);
    // كل طالب يُحسب مرة واحدة مهما تكررت أخطاؤه
    const [{ count }] = await sql<{ count: number }[]>`select count from rate_limits where key = ${`login:ipfail:${school}`}`;
    expect(count).toBe(40);
    expect((await right(classOf40[0]!.email, school)).ok).toBe(true);
  }, 120_000);

  it("trying one password across many accounts from one IP stops at the limit", async () => {
    const ip = "198.51.100.13";
    const u = await createUser();
    for (let i = 0; i < 100; i++) await wrong(`spray-${i}@example.com`, ip);
    const blocked = await right(u.email, ip);
    expect(blocked).toMatchObject({ ok: false, error: "محاولات كثيرة. حاول مرة أخرى بعد قليل." });
    expect((await right(u.email, "198.51.100.14")).ok).toBe(true);
  }, 120_000);
});

describe("no account enumeration", () => {
  it("known and unknown addresses get the same answers at the same attempts", async () => {
    const u = await createUser();
    const ip = "198.51.100.20";
    const strip = (r: Awaited<ReturnType<typeof wrong>>) => (r.ok ? "ok" : r.error.replace(/المدة المتبقية: .*/, ""));
    for (let i = 0; i < 7; i++) {
      const known = await wrong(u.email, ip);
      const unknown = await wrong("no-such-person@example.com", ip);
      expect(strip(known), `attempt ${i}`).toBe(strip(unknown));
    }
  });

  it("an unknown address still spends the time of a password check", async () => {
    burnt.passwords.length = 0;
    await wrong("no-such-account@example.com", "198.51.100.22", "the-guess");
    expect(burnt.passwords).toEqual(["the-guess"]);
  });

  it("a suspended account reveals itself only to someone holding the right password", async () => {
    const u = await createUser({ isActive: false });
    expect(await wrong(u.email, "198.51.100.21")).toEqual({ ok: false, error: "البريد الإلكتروني أو كلمة المرور غير صحيحة." });
    expect(await right(u.email, "198.51.100.21")).toEqual({ ok: false, error: "هذا الحساب موقوف. تواصل مع الدعم." });
  });
});

describe("recovery lifts the wait", () => {
  it("setting a new password through the link clears every failure counter of the account", async () => {
    const u = await createUser();
    const ip = "198.51.100.30";
    for (let i = 0; i < 6; i++) await wrong(u.email, ip);
    const token = "reset-token-for-lockout-test-0123456789";
    await sql`insert into password_reset_tokens (id, user_id, expires_at) values (${hashToken(token)}, ${u.id}, now() + interval '1 hour')`;
    expect(await resetPassword(token, "Brand-New-Student-1")).toEqual({ ok: true });
    expect((await loginWithPassword(u.email, "Brand-New-Student-1", meta(ip))).ok).toBe(true);
  });
});
