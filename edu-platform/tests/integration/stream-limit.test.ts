import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { grantProduct } from "@/server/access/entitlements";
import { storage } from "@/server/storage";
import { STREAM_LIMITS, STREAM_WINDOW_SECONDS } from "@/server/video/stream-limit";
import { closeDb, resetDb, sql } from "../helpers/db";
import { createUser, createVideoProduct } from "../helpers/factories";

const session = vi.hoisted(() => ({ user: null as null | { id: string; email: string; role: string } }));
vi.mock("@/server/auth/session", async (original) => ({ ...(await original<typeof import("@/server/auth/session")>()), getCurrentUser: async () => session.user }));

const { GET } = await import("@/app/api/lessons/[lessonId]/stream/route");

const SCHOOL_IP = "203.0.113.50";

type Viewer = { id: string; email: string; role: string } | null;

function play(lessonId: string, viewer: Viewer, opts: { ip?: string; range?: string } = {}) {
  session.user = viewer;
  return GET(new NextRequest(`http://localhost/api/lessons/${lessonId}/stream`, { headers: { "x-forwarded-for": opts.ip ?? SCHOOL_IP, ...(opts.range ? { range: opts.range } : {}) } }), { params: Promise.resolve({ lessonId }) });
}

async function ownedLesson() {
  const user = await createUser();
  const product = await createVideoProduct({ lessons: 1 });
  await grantProduct(sql, { userId: user.id, productId: product.id, source: "manual", grantedBy: null, reason: "test" });
  return { user, lessonId: product.lessonIds[0], productId: product.id };
}

const counterOf = async (key: string) => (await sql<{ count: number }[]>`select count from rate_limits where key = ${key}`)[0]?.count ?? 0;
const accessLogs = async (lessonId: string, action: string) => (await sql<{ n: number }[]>`select count(*)::int as n from access_logs where lesson_id = ${lessonId} and action = ${action}`)[0].n;
const preSpend = (key: string, count: number) => sql`insert into rate_limits (key, count, reset_at) values (${key}, ${count}, now() + make_interval(secs => ${STREAM_WINDOW_SECONDS})) on conflict (key) do update set count = excluded.count, reset_at = excluded.reset_at`;

beforeAll(resetDb);
afterAll(closeDb);
beforeEach(() => sql`delete from rate_limits`);
afterEach(() => {
  session.user = null;
  vi.restoreAllMocks();
});

/** ما يطلبه مشغل حقيقي: الأجزاء المتتالية ثم القفزات */
async function runInParallel(total: number, width: number, one: (i: number) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: width }, async () => {
      while (next < total) await one(next++);
    }),
  );
}

describe("normal playback is never limited", () => {
  it("a long high-bitrate lesson at double speed with heavy seeking, from one account", { timeout: 120_000 }, async () => {
    const { user, lessonId } = await ownedLesson();
    // 20Mbps بسرعة 2x بأجزاء 4MB = 750 جزءًا في 10 دقائق، و60 قفزة بثلاثة طلبات، وتحميل مسبق
    const requests = 750 + 60 * 3 + 40;
    expect(requests).toBeLessThanOrEqual(STREAM_LIMITS.account);
    const statuses = new Set<number>();
    await runInParallel(requests, 4, async (i) => {
      statuses.add((await play(lessonId, user, { range: i ? "bytes=1-" : "bytes=0-" })).status);
    });
    expect([...statuses]).toEqual([206]);
    expect(await counterOf(`stream:user:${user.id}`)).toBe(requests);
  });

  it("a whole class of accounts on one school address does not share a limit", async () => {
    const product = await createVideoProduct({ lessons: 1 });
    const students = await Promise.all(Array.from({ length: 40 }, () => createUser()));
    for (const s of students) await grantProduct(sql, { userId: s.id, productId: product.id, source: "manual", grantedBy: null, reason: "test" });
    // العنوان مستهلك بالكامل، وهذا لا يخص أصحاب الحسابات
    await preSpend(`stream:ip:${SCHOOL_IP}`, STREAM_LIMITS.anonymousPerIp + 50);
    const out = await Promise.all(students.map((s) => play(product.lessonIds[0], s, { range: "bytes=0-" })));
    expect(new Set(out.map((r) => r.status))).toEqual(new Set([206]));
  });

  it("a class of visitors on one address can all watch the free preview", { timeout: 120_000 }, async () => {
    const product = await createVideoProduct({ lessons: 1, freePreviewIndex: 0 });
    // 40 زائرًا، لكل منهم 30 جزءًا: معاينة 120MB كاملة
    const statuses = new Set<number>();
    await runInParallel(40 * 30, 4, async () => {
      statuses.add((await play(product.lessonIds[0], null, { range: "bytes=1-" })).status);
    });
    expect([...statuses]).toEqual([206]);
    expect(40 * 75).toBeLessThanOrEqual(STREAM_LIMITS.anonymousPerIp);
  });

  it("an account that exhausted one device's budget is counted once, across devices", async () => {
    const { user, lessonId } = await ownedLesson();
    await play(lessonId, user, { ip: "198.51.100.1", range: "bytes=1-" });
    await play(lessonId, user, { ip: "198.51.100.2", range: "bytes=1-" });
    expect(await counterOf(`stream:user:${user.id}`)).toBe(2);
  });
});

describe("a flood is stopped", () => {
  it("over the account budget: 429 with Retry-After, nothing logged, no signed link minted", async () => {
    const { user, lessonId } = await ownedLesson();
    const signedUrl = vi.spyOn(storage(), "signedUrl");
    await preSpend(`stream:user:${user.id}`, STREAM_LIMITS.account);
    const res = await play(lessonId, user, { range: "bytes=0-" });
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(await res.arrayBuffer()).toHaveProperty("byteLength", 0);
    expect(signedUrl).not.toHaveBeenCalled();
    expect(await accessLogs(lessonId, "video")).toBe(0);
  });

  it("the last allowed request still plays", async () => {
    const { user, lessonId } = await ownedLesson();
    await preSpend(`stream:user:${user.id}`, STREAM_LIMITS.account - 1);
    expect((await play(lessonId, user, { range: "bytes=1-" })).status).toBe(206);
    expect((await play(lessonId, user, { range: "bytes=1-" })).status).toBe(429);
  });

  it("one flooding account does not touch anyone else on the same address", async () => {
    const a = await ownedLesson();
    const b = await ownedLesson();
    await preSpend(`stream:user:${a.user.id}`, STREAM_LIMITS.account + 5);
    expect((await play(a.lessonId, a.user, { range: "bytes=1-" })).status).toBe(429);
    expect((await play(b.lessonId, b.user, { range: "bytes=1-" })).status).toBe(206);
  });

  it("visitors over the address budget get 429, and a signed-in student there still plays", async () => {
    const free = await createVideoProduct({ lessons: 1, freePreviewIndex: 0 });
    const { user, lessonId } = await ownedLesson();
    await preSpend(`stream:ip:${SCHOOL_IP}`, STREAM_LIMITS.anonymousPerIp);
    expect((await play(free.lessonIds[0], null, { range: "bytes=1-" })).status).toBe(429);
    expect((await play(lessonId, user, { range: "bytes=1-" })).status).toBe(206);
  });

  it("the window passes and the viewer is back", async () => {
    const { user, lessonId } = await ownedLesson();
    await sql`insert into rate_limits (key, count, reset_at) values (${`stream:user:${user.id}`}, ${STREAM_LIMITS.account + 9}, now() - interval '1 second')`;
    expect((await play(lessonId, user, { range: "bytes=1-" })).status).toBe(206);
  });
});

describe("denied requests have their own counter", () => {
  it("they cost no playback budget, and stop being logged once over their limit", async () => {
    const { user, lessonId } = await ownedLesson();
    const locked = await createVideoProduct({ lessons: 1 });
    await preSpend(`stream-denied:user:${user.id}`, STREAM_LIMITS.deniedPerAccount - 1);
    expect((await play(locked.lessonIds[0], user)).status).toBe(403);
    expect(await accessLogs(locked.lessonIds[0], "denied")).toBe(1);

    const over = await play(locked.lessonIds[0], user);
    expect(over.status).toBe(429);
    expect(Number(over.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await accessLogs(locked.lessonIds[0], "denied")).toBe(1);

    expect(await counterOf(`stream:user:${user.id}`)).toBe(0);
    expect((await play(lessonId, user, { range: "bytes=1-" })).status).toBe(206);
  });

  it("a visitor probing paid lessons does not cut off a free preview on the same network", async () => {
    const paid = await createVideoProduct({ lessons: 1 });
    const free = await createVideoProduct({ lessons: 1, freePreviewIndex: 0 });
    await preSpend(`stream-denied:ip:${SCHOOL_IP}`, STREAM_LIMITS.deniedPerIp);
    expect((await play(paid.lessonIds[0], null)).status).toBe(429);
    expect((await play(free.lessonIds[0], null, { range: "bytes=1-" })).status).toBe(206);
  });

  it("an honest denial still says why", async () => {
    const paid = await createVideoProduct({ lessons: 1 });
    expect((await play(paid.lessonIds[0], null)).status).toBe(401);
  });
});
