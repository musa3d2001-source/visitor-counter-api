import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { grantProduct } from "@/server/access/entitlements";
import { createSession, hashToken, SESSION_COOKIE } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { BEAT_LIMIT_PER_MINUTE, BEAT_WINDOW_SECONDS, refusedFromMemory, rememberBeat, resetBeatMemory } from "@/server/video/heartbeat";
import { closeDb, resetDb, sql } from "../helpers/db";
import { createUser, createVideoProduct } from "../helpers/factories";

const jar = vi.hoisted(() => ({ token: null as string | null }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => (name === "session" && jar.token ? { value: jar.token } : undefined) }), headers: async () => new Headers() }));

const { POST } = await import("@/app/api/lessons/[lessonId]/progress/route");

type Beat = { position?: number; completed?: boolean };

function send(lessonId: string, token: string | null, beat: Beat | string = { position: 60 }, opts: { origin?: string | null; headers?: Record<string, string> } = {}) {
  jar.token = token;
  const origin = opts.origin === undefined ? "http://localhost:3000" : opts.origin;
  return POST(
    new NextRequest(`http://localhost:3000/api/lessons/${lessonId}/progress`, {
      method: "POST",
      headers: { host: "localhost:3000", "content-type": "application/json", ...(origin ? { origin } : {}), ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}), ...opts.headers },
      body: typeof beat === "string" ? beat : JSON.stringify(beat),
    }),
    { params: Promise.resolve({ lessonId }) },
  );
}

/** عدد أوامر SQL التي نفذها fn فعلًا على الاتصال */
async function statementsOf<T>(fn: () => Promise<T>): Promise<{ out: T; statements: number }> {
  const db = getDb();
  let statements = 0;
  (db.options as { debug?: unknown }).debug = () => {
    statements++;
  };
  try {
    const out = await fn();
    return { out, statements };
  } finally {
    (db.options as { debug?: unknown }).debug = undefined;
  }
}

async function viewer(role: "student" | "teacher" | "admin" = "student") {
  const user = await createUser({ role });
  const product = await createVideoProduct({ lessons: 1 });
  await grantProduct(sql, { userId: user.id, productId: product.id, source: "manual", grantedBy: null, reason: "test" });
  const { token } = await createSession(user.id);
  return { user, token, lessonId: product.lessonIds[0], productId: product.id };
}

const rowOf = async (userId: string, lessonId: string) => (await sql<{ position_seconds: number; completed: boolean; updated_at: Date }[]>`select position_seconds, completed, updated_at from lesson_progress where user_id = ${userId} and lesson_id = ${lessonId}`)[0];
const ageRow = (userId: string, lessonId: string, seconds: number) => sql`update lesson_progress set updated_at = now() - make_interval(secs => ${seconds}) where user_id = ${userId} and lesson_id = ${lessonId}`;
const counter = async (userId: string) => (await sql<{ count: number }[]>`select count from rate_limits where key = ${`beat:${userId}`}`)[0]?.count ?? 0;

beforeAll(resetDb);
afterAll(closeDb);
beforeEach(async () => {
  resetBeatMemory();
  await sql`delete from rate_limits`;
});
afterEach(() => {
  jar.token = null;
});

describe("a repeat beat costs one statement and an early beat almost nothing", () => {
  it("accepts the first beat after a full access check and creates the row", async () => {
    const { user, token, lessonId } = await viewer();
    const res = await send(lessonId, token, { position: 42.7 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect((await rowOf(user.id, lessonId)).position_seconds).toBe(42);
  });

  it("refuses an early beat on the same server instance with no database work at all", async () => {
    const { user, token, lessonId } = await viewer();
    await send(lessonId, token, { position: 42 });
    const before = await rowOf(user.id, lessonId);
    const { out, statements } = await statementsOf(() => send(lessonId, token, { position: 50 }));
    expect(out.status).toBe(204);
    expect(await out.text()).toBe("");
    expect(statements).toBe(0);
    expect(await rowOf(user.id, lessonId)).toEqual(before);
  });

  it("refuses an early beat on another instance with exactly one statement and writes no progress", async () => {
    const { user, token, lessonId } = await viewer();
    await send(lessonId, token, { position: 42 });
    const before = await rowOf(user.id, lessonId);
    resetBeatMemory();
    const { out, statements } = await statementsOf(() => send(lessonId, token, { position: 50 }));
    expect(out.status).toBe(204);
    expect(statements).toBe(1);
    expect(await rowOf(user.id, lessonId)).toEqual(before);
  });

  it("accepts a beat after the gap with exactly one statement", async () => {
    const { user, token, lessonId } = await viewer();
    await send(lessonId, token, { position: 42 });
    await ageRow(user.id, lessonId, 16);
    resetBeatMemory();
    const { out, statements } = await statementsOf(() => send(lessonId, token, { position: 58 }));
    expect(out.status).toBe(200);
    expect(statements).toBe(1);
    expect((await rowOf(user.id, lessonId)).position_seconds).toBe(58);
  });

  it("a harness beating every 10 seconds sees only accepted and early answers, never a failure", async () => {
    const { user, token, lessonId } = await viewer();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      resetBeatMemory();
      statuses.push((await send(lessonId, token, { position: i * 10 })).status);
      await ageRow(user.id, lessonId, i % 2 === 0 ? 10 : 20);
    }
    expect(statuses).toEqual([200, 204, 200, 204, 200, 204]);
  });

  it("two concurrent early beats write once between them", async () => {
    const { user, token, lessonId } = await viewer();
    await send(lessonId, token, { position: 1 });
    await ageRow(user.id, lessonId, 20);
    resetBeatMemory();
    const out = await Promise.all([send(lessonId, token, { position: 30 }), send(lessonId, token, { position: 31 })]);
    expect(out.map((r) => r.status).sort()).toEqual([200, 204]);
  });
});

describe("completion is not lost to the gap", () => {
  it("lets the first completed beat through inside the window, on the instance that just refused others", async () => {
    const { user, token, lessonId } = await viewer();
    await send(lessonId, token, { position: 42 });
    expect((await send(lessonId, token, { position: 43 })).status).toBe(204);
    const done = await send(lessonId, token, { position: 900, completed: true });
    expect(done.status).toBe(200);
    expect(await rowOf(user.id, lessonId)).toMatchObject({ completed: true, position_seconds: 900 });
  });

  it("does not let a completed beat bypass the gap twice", async () => {
    const { user, token, lessonId } = await viewer();
    await send(lessonId, token, { position: 42, completed: true });
    resetBeatMemory();
    const again = await send(lessonId, token, { position: 900, completed: true });
    expect(again.status).toBe(204);
    expect((await rowOf(user.id, lessonId)).position_seconds).toBe(42);
  });

  it("never un-completes a lesson", async () => {
    const { user, token, lessonId } = await viewer();
    await send(lessonId, token, { position: 900, completed: true });
    await ageRow(user.id, lessonId, 20);
    resetBeatMemory();
    expect((await send(lessonId, token, { position: 12, completed: false })).status).toBe(200);
    expect(await rowOf(user.id, lessonId)).toMatchObject({ completed: true, position_seconds: 12 });
  });
});

describe("the account limit", () => {
  const spend = (userId: string, n: number) => sql`insert into rate_limits (key, count, reset_at) values (${`beat:${userId}`}, ${n}, now() + make_interval(secs => ${BEAT_WINDOW_SECONDS})) on conflict (key) do update set count = excluded.count, reset_at = excluded.reset_at`;

  it("answers 429 with Retry-After, writes nothing, and the next refusal costs nothing", async () => {
    const { user, token, lessonId } = await viewer();
    await send(lessonId, token, { position: 42 });
    await ageRow(user.id, lessonId, 30);
    const before = await rowOf(user.id, lessonId);
    await spend(user.id, BEAT_LIMIT_PER_MINUTE);
    resetBeatMemory();
    const first = await statementsOf(() => send(lessonId, token, { position: 50 }));
    expect(first.out.status).toBe(429);
    expect(first.statements).toBe(1);
    expect(Number(first.out.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await rowOf(user.id, lessonId)).toEqual(before);
    expect(await counter(user.id)).toBe(BEAT_LIMIT_PER_MINUTE);

    const second = await statementsOf(() => send(lessonId, token, { position: 51 }));
    expect(second.out.status).toBe(429);
    expect(second.statements).toBe(0);
  });

  it("counts every statement-level beat for a student, so several lessons or instances cannot multiply it", async () => {
    const { user, token, lessonId } = await viewer();
    await send(lessonId, token, { position: 1 });
    for (let i = 0; i < 3; i++) {
      resetBeatMemory();
      await send(lessonId, token, { position: 2 + i });
    }
    expect(await counter(user.id)).toBe(4);
  });

  it("starts a new window once the old one has passed", async () => {
    const { user, token, lessonId } = await viewer();
    await send(lessonId, token, { position: 1 });
    await ageRow(user.id, lessonId, 30);
    await sql`insert into rate_limits (key, count, reset_at) values (${`beat:${user.id}`}, 999, now() - interval '1 second') on conflict (key) do update set count = excluded.count, reset_at = excluded.reset_at`;
    resetBeatMemory();
    expect((await send(lessonId, token, { position: 60 })).status).toBe(200);
    expect(await counter(user.id)).toBe(1);
  });

  it("limits staff too, who take the full path", async () => {
    const { user, token, lessonId } = await viewer("admin");
    await sql`insert into rate_limits (key, count, reset_at) values (${`beat:${user.id}`}, ${BEAT_LIMIT_PER_MINUTE}, now() + interval '1 minute')`;
    const res = await send(lessonId, token, { position: 1 });
    expect(res.status).toBe(429);
    expect(await rowOf(user.id, lessonId)).toBeUndefined();
  });

  it("the memory filter never answers for a session the database has not vouched for", () => {
    expect(refusedFromMemory(hashToken("forged"), crypto.randomUUID(), false)).toBeNull();
  });

  it("the memory filter expires with the gap", () => {
    const lesson = crypto.randomUUID();
    rememberBeat("s", lesson, false, 15, 1_000);
    expect(refusedFromMemory("s", lesson, false, 15_999)).toEqual({ kind: "early" });
    expect(refusedFromMemory("s", lesson, false, 16_000)).toBeNull();
  });
});

describe("who is refused", () => {
  it("no cookie: 401 with no database work", async () => {
    const { lessonId } = await viewer();
    const { out, statements } = await statementsOf(() => send(lessonId, null));
    expect(out.status).toBe(401);
    expect(statements).toBe(0);
  });

  it("cross-origin: 403 with no database work", async () => {
    const { token, lessonId } = await viewer();
    const { out, statements } = await statementsOf(() => send(lessonId, token, { position: 1 }, { origin: "https://evil.example" }));
    expect(out.status).toBe(403);
    expect(statements).toBe(0);
  });

  it("a bad lesson id or a bad or oversized body: refused with no database work", async () => {
    const { token, lessonId } = await viewer();
    expect((await statementsOf(() => send("not-a-uuid", token))).statements).toBe(0);
    expect((await send("not-a-uuid", token)).status).toBe(403);
    for (const body of ["{not json", JSON.stringify({ position: -1 }), JSON.stringify({ position: "x" }), JSON.stringify({ position: 1, pad: "y".repeat(5000) })]) {
      const { out, statements } = await statementsOf(() => send(lessonId, token, body));
      expect(out.status).toBe(400);
      expect(statements).toBe(0);
    }
  });

  it("a forged session: 401 after one statement, no rows anywhere", async () => {
    const { lessonId } = await viewer();
    const { out, statements } = await statementsOf(() => send(lessonId, "f".repeat(43), { position: 1 }));
    expect(out.status).toBe(401);
    expect(statements).toBe(1);
  });

  it("a student without access: 403 and no progress row", async () => {
    const student = await createUser();
    const { token } = await createSession(student.id);
    const { lessonId } = await viewer();
    const res = await send(lessonId, token, { position: 5 });
    expect(res.status).toBe(403);
    expect(await rowOf(student.id, lessonId)).toBeUndefined();
  });

  it("an expired session or a suspended student is not treated as a viewer", async () => {
    const a = await viewer();
    await send(a.lessonId, a.token, { position: 1 });
    await ageRow(a.user.id, a.lessonId, 30);
    await sql`update sessions set expires_at = now() - interval '1 minute' where id = ${hashToken(a.token)}`;
    resetBeatMemory();
    expect((await send(a.lessonId, a.token, { position: 2 })).status).toBe(401);
    expect((await rowOf(a.user.id, a.lessonId)).position_seconds).toBe(1);

    const b = await viewer();
    await send(b.lessonId, b.token, { position: 1 });
    await ageRow(b.user.id, b.lessonId, 30);
    await sql`update users set is_active = false where id = ${b.user.id}`;
    resetBeatMemory();
    expect((await send(b.lessonId, b.token, { position: 2 })).status).toBe(401);
    expect((await rowOf(b.user.id, b.lessonId)).position_seconds).toBe(1);
  });

  it("a session that must still change its password is not a viewer", async () => {
    const a = await viewer();
    await send(a.lessonId, a.token, { position: 1 });
    await ageRow(a.user.id, a.lessonId, 30);
    await sql`update users set must_change_password = true where id = ${a.user.id}`;
    resetBeatMemory();
    expect((await send(a.lessonId, a.token, { position: 2 })).status).toBe(401);
    expect((await rowOf(a.user.id, a.lessonId)).position_seconds).toBe(1);
  });

  it("staff beats save through the full path and honour the gap", async () => {
    const { user, token, lessonId } = await viewer("admin");
    expect((await send(lessonId, token, { position: 10 })).status).toBe(200);
    expect((await send(lessonId, token, { position: 11 })).status).toBe(204);
    expect((await rowOf(user.id, lessonId)).position_seconds).toBe(10);
  });
});
