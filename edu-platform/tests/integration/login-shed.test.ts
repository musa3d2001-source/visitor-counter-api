import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { HASH_BUSY_MESSAGE, LOGIN_BUSY_MESSAGE } from "@/lib/busy";
import { configureHashGateForTests, hashGateState, withHashSlot } from "@/server/auth/hash-gate";
import { changePassword, completeForcedPasswordChange, loginWithPassword, registerStudent, resetPassword } from "@/server/auth/service";
import { createSession, hashToken } from "@/server/auth/session";
import { closeDb, resetDb, sql } from "../helpers/db";
import { createUser, TEST_PASSWORD } from "../helpers/factories";

/** عدد عمليات scrypt الفعلية: الفرق الزمني بين بريد مسجل وغير مسجل يُغلق بعددها، وقياس الزمن نفسه لا يصلح في اختبار */
const scrypts = vi.hoisted(() => ({ count: 0 }));
vi.mock("node:crypto", async (original) => {
  const actual = await original<typeof import("node:crypto")>();
  return {
    ...actual,
    scrypt: (...args: unknown[]) => {
      scrypts.count++;
      return (actual.scrypt as unknown as (...a: unknown[]) => void)(...args);
    },
  };
});

/** حالة البوابة لحظة فتح الجلسة: يجب أن يكون المكان قد عاد */
const atSession = vi.hoisted(() => ({ seen: [] as number[], probe: null as null | (() => number) }));
vi.mock("@/server/auth/session", async (original) => {
  const actual = await original<typeof import("@/server/auth/session")>();
  return {
    ...actual,
    createSession: (...args: Parameters<typeof actual.createSession>) => {
      if (atSession.probe) atSession.seen.push(atSession.probe());
      return actual.createSession(...args);
    },
  };
});

const IP = "198.51.100.77";
const meta = { ip: IP, userAgent: "vitest" };
const WRONG = "البريد الإلكتروني أو كلمة المرور غير صحيحة.";
const SHED = { ok: false, error: LOGIN_BUSY_MESSAGE, retryAfter: 5, busy: true };
const rateRows = async () => (await sql<{ key: string; count: number }[]>`select key, count from rate_limits order by key`).map((r) => `${r.key}=${r.count}`);

/** يملأ البوابة: مكان واحد مشغول، بلا طابور، فكل محاولة تالية تُرفض فورًا */
function fillGate(opts: { queue?: number; waitMs?: number } = {}) {
  configureHashGateForTests({ slots: 1, queue: opts.queue ?? 0, waitMs: opts.waitMs ?? 20 });
  let release!: () => void;
  const until = new Promise<void>((r) => (release = r));
  const holder = withHashSlot(() => until);
  return async () => {
    release();
    await holder;
  };
}

let open: (() => Promise<void>) | null = null;
const gateFull = (opts?: { queue?: number; waitMs?: number }) => {
  open = fillGate(opts);
};
const freeGate = async () => {
  await open?.();
  open = null;
  configureHashGateForTests(null);
};

beforeAll(resetDb);
afterAll(closeDb);
beforeEach(async () => {
  await sql`truncate rate_limits`;
  scrypts.count = 0;
});
afterEach(freeGate);

describe("a login refused because the instance is busy", () => {
  it("is told to try again, never that the password is wrong", async () => {
    const u = await createUser();
    gateFull();
    const res = await loginWithPassword(u.email, TEST_PASSWORD, meta);
    expect(res).toEqual(SHED);
    expect(JSON.stringify(res)).not.toContain(WRONG);
  });

  it("does the same work for a known and an unknown email", async () => {
    const u = await createUser();
    gateFull();
    expect(await loginWithPassword(u.email, "wrong-password", meta)).toEqual(SHED);
    expect(await loginWithPassword("nobody-here@farqad.test", "wrong-password", meta)).toEqual(SHED);
    expect(scrypts.count).toBe(0);
    expect(await rateRows()).toEqual([]);
  });

  it("never counts against the account, the pair or the address", async () => {
    const u = await createUser();
    for (let i = 0; i < 3; i++) await loginWithPassword(u.email, "wrong-password", meta);
    const before = await rateRows();
    expect(before.length).toBeGreaterThan(0);
    gateFull();
    for (let i = 0; i < 30; i++) expect(await loginWithPassword(u.email, "wrong-password", meta)).toEqual(SHED);
    expect(await rateRows()).toEqual(before);
  });

  it("thirty shed attempts leave the owner of the account free to log in", async () => {
    const u = await createUser();
    gateFull();
    for (let i = 0; i < 30; i++) await loginWithPassword(u.email, TEST_PASSWORD, meta);
    await freeGate();
    expect((await loginWithPassword(u.email, TEST_PASSWORD, meta)).ok).toBe(true);
  });

  it("waits its turn while the wait is short, then logs in normally", async () => {
    const u = await createUser();
    gateFull({ queue: 5, waitMs: 2_000 });
    const pending = loginWithPassword(u.email, TEST_PASSWORD, meta);
    await new Promise((r) => setTimeout(r, 30));
    expect(hashGateState()).toMatchObject({ active: 1, waiting: 1 });
    await freeGate();
    expect((await pending).ok).toBe(true);
  });

  it("gives the slot back before the session is opened", async () => {
    const u = await createUser();
    configureHashGateForTests({ slots: 1, queue: 0 });
    atSession.seen.length = 0;
    atSession.probe = () => hashGateState().active;
    const res = await loginWithPassword(u.email, TEST_PASSWORD, meta);
    atSession.probe = null;
    expect(res.ok).toBe(true);
    expect(atSession.seen).toEqual([0]);
  });
});

describe("the timing difference between a known and an unknown email", () => {
  it("costs one hash each, even for the first unknown email on an instance", async () => {
    vi.resetModules();
    const fresh = await import("@/server/auth/service");
    const u = await createUser();
    scrypts.count = 0;
    await fresh.loginWithPassword("first-unknown@farqad.test", "wrong-password", meta);
    expect(scrypts.count).toBe(1);
    await sql`truncate rate_limits`;
    scrypts.count = 0;
    await fresh.loginWithPassword(u.email, "wrong-password", meta);
    expect(scrypts.count).toBe(1);
  });
});

describe("other password paths when the instance is busy", () => {
  it("registration keeps its answer friendly, creates nothing and is not counted", async () => {
    gateFull();
    const email = `shed-${Date.now()}@farqad.test`;
    const res = await registerStudent({ fullName: "طالب", email, password: "Long-Enough-Pass-1", phone: null, acceptedDocuments: true, acceptedGuardian: true }, meta);
    expect(res).toEqual({ ok: false, error: HASH_BUSY_MESSAGE });
    expect(await sql`select 1 from users where email = ${email}`).toHaveLength(0);
    expect(await rateRows()).toEqual([]);
  });

  it("changing a password neither tests it nor counts it", async () => {
    const u = await createUser();
    const sessionId = hashToken((await createSession(u.id, meta)).token);
    gateFull();
    expect(await changePassword(u.id, TEST_PASSWORD, "Another-Long-Pass-2", sessionId)).toEqual({ ok: false, error: HASH_BUSY_MESSAGE });
    expect(await rateRows()).toEqual([]);
    const [{ password_hash }] = await sql<{ password_hash: string }[]>`select password_hash from users where id = ${u.id}`;
    await freeGate();
    expect((await changePassword(u.id, TEST_PASSWORD, "Another-Long-Pass-2", sessionId)).ok).toBe(true);
    expect((await sql<{ password_hash: string }[]>`select password_hash from users where id = ${u.id}`)[0].password_hash).not.toBe(password_hash);
  });

  it("replacing a temporary password is not counted either", async () => {
    const u = await createUser();
    await sql`update users set must_change_password = true, temp_password_expires_at = now() + interval '1 day' where id = ${u.id}`;
    gateFull();
    expect(await completeForcedPasswordChange(u.id, "Another-Long-Pass-3", { ip: IP, userAgent: "vitest" })).toEqual({ ok: false, error: HASH_BUSY_MESSAGE });
    expect(await rateRows()).toEqual([]);
    const [row] = await sql<{ must_change_password: boolean }[]>`select must_change_password from users where id = ${u.id}`;
    expect(row.must_change_password).toBe(true);
  });
});

describe("password reset hashes outside its transaction", () => {
  async function resetToken(userId: string, label: string) {
    await sql`insert into password_reset_tokens (id, user_id, expires_at) values (${hashToken(label)}, ${userId}, now() + interval '1 hour')`;
    return label;
  }

  it("holds no lock on the token while it waits for its turn", async () => {
    const u = await createUser();
    const token = await resetToken(u.id, "reset-no-lock-token");
    gateFull({ queue: 5, waitMs: 3_000 });
    const before = scrypts.count;
    const pending = resetPassword(token, "Brand-New-Password-1");
    await vi.waitFor(() => expect(hashGateState().waiting).toBe(1));
    // nowait: لو كان الرمز مقفلًا لفشل هذا الأمر فورًا
    await sql.begin(async (tx) => {
      await tx`select 1 from password_reset_tokens where id = ${hashToken(token)} for update nowait`;
    });
    await freeGate();
    await expect(pending).resolves.toEqual({ ok: true });
    expect(scrypts.count - before).toBe(1);
  });

  it("keeps the link usable when refused for being busy", async () => {
    const u = await createUser();
    const token = await resetToken(u.id, "reset-busy-token-1");
    gateFull();
    expect(await resetPassword(token, "Brand-New-Password-2")).toEqual({ ok: false, error: HASH_BUSY_MESSAGE });
    const [row] = await sql<{ used_at: Date | null }[]>`select used_at from password_reset_tokens where id = ${hashToken(token)}`;
    expect(row.used_at).toBeNull();
    await freeGate();
    expect(await resetPassword(token, "Brand-New-Password-2")).toEqual({ ok: true });
  });

  it("two simultaneous uses of one link still succeed once", async () => {
    const u = await createUser();
    const token = await resetToken(u.id, "reset-race-token-01");
    const results = await Promise.all([resetPassword(token, "Brand-New-Password-3"), resetPassword(token, "Brand-New-Password-4")]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it("a link spent while the hash ran is refused under the lock", async () => {
    const u = await createUser();
    const token = await resetToken(u.id, "reset-spent-midway");
    gateFull({ queue: 5, waitMs: 3_000 });
    const pending = resetPassword(token, "Brand-New-Password-5");
    await vi.waitFor(() => expect(hashGateState().waiting).toBe(1));
    await sql`update password_reset_tokens set used_at = now() where id = ${hashToken(token)}`;
    await freeGate();
    await expect(pending).resolves.toMatchObject({ ok: false, error: expect.stringContaining("سبق استخدامه") });
  });
});
