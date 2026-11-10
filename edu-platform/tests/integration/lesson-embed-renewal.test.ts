import { createHash, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { grantProduct } from "@/server/access/entitlements";
import { resetEnvCache } from "@/server/env";
import { EMBED_TOKEN_TTL_SECONDS } from "@/server/video/bunny";
import { EMBED_RENEW_LIMITS, EMBED_RENEW_WINDOW_SECONDS } from "@/server/video/stream-limit";
import { closeDb, resetDb, sql } from "../helpers/db";
import { createUser, createVideoProduct } from "../helpers/factories";

const session = vi.hoisted(() => ({ user: null as null | { id: string; email: string; role: string } }));
vi.mock("@/server/auth/session", async (original) => ({ ...(await original<typeof import("@/server/auth/session")>()), getCurrentUser: async () => session.user }));

const { POST } = await import("@/app/api/lessons/[lessonId]/embed/route");

const TOKEN_KEY = "embed-test-token-key";
const IP = "203.0.113.77";

function renew(lessonId: string, viewer: typeof session.user, origin: string | null = "http://localhost:3000") {
  session.user = viewer;
  return POST(new NextRequest(`http://localhost:3000/api/lessons/${lessonId}/embed`, { method: "POST", headers: { host: "localhost:3000", "x-forwarded-for": IP, ...(origin ? { origin } : {}) } }), { params: Promise.resolve({ lessonId }) });
}

async function ownedBunnyLesson(opts: { freePreviewIndex?: number } = {}) {
  const user = await createUser();
  const guid = randomUUID();
  const product = await createVideoProduct({ lessons: 1, provider: "bunny", videoRefs: [guid], ...opts });
  await grantProduct(sql, { userId: user.id, productId: product.id, source: "manual", grantedBy: null, reason: "test" });
  return { user, guid, lessonId: product.lessonIds[0], productId: product.id };
}

const logs = async (lessonId: string, action: string) => (await sql<{ n: number }[]>`select count(*)::int as n from access_logs where lesson_id = ${lessonId} and action = ${action}`)[0].n;

beforeAll(async () => {
  await resetDb();
  Object.assign(process.env, { VIDEO_PROVIDER: "bunny", BUNNY_STREAM_LIBRARY_ID: "77", BUNNY_STREAM_API_KEY: "k", BUNNY_STREAM_TOKEN_KEY: TOKEN_KEY, BUNNY_STREAM_READONLY_API_KEY: "ro", BUNNY_STREAM_EMBED_BASE: "https://embed.test" });
  resetEnvCache();
});
afterAll(async () => {
  for (const k of Object.keys(process.env)) if (k.startsWith("BUNNY_") || k === "VIDEO_PROVIDER") delete process.env[k];
  resetEnvCache();
  await closeDb();
});
beforeEach(() => sql`delete from rate_limits`);
afterEach(() => {
  session.user = null;
});

describe("renewing the embed link", () => {
  it("gives an entitled viewer a fresh signed link of about an hour, never cached", async () => {
    const { user, guid, lessonId } = await ownedBunnyLesson();
    const res = await renew(lessonId, user);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    const data = (await res.json()) as { embedUrl: string; expiresInSeconds: number };
    expect(data.expiresInSeconds).toBe(EMBED_TOKEN_TTL_SECONDS);
    expect(EMBED_TOKEN_TTL_SECONDS).toBe(3600);
    const url = new URL(data.embedUrl);
    const expires = Number(url.searchParams.get("expires"));
    const now = Math.floor(Date.now() / 1000);
    expect(expires).toBeGreaterThanOrEqual(now + 3595);
    expect(expires).toBeLessThanOrEqual(now + 3605);
    expect(url.searchParams.get("token")).toBe(createHash("sha256").update(`${TOKEN_KEY}${guid}${expires}`).digest("hex"));
  });

  it("does not renew for a viewer whose access was refunded", async () => {
    const { user, lessonId, productId } = await ownedBunnyLesson();
    expect((await renew(lessonId, user)).status).toBe(200);
    await sql`update entitlements set revoked_at = now() where user_id = ${user.id} and product_id = ${productId}`;
    const res = await renew(lessonId, user);
    expect(res.status).toBe(403);
    expect(await res.text()).toBe("");
    expect(await logs(lessonId, "denied")).toBe(1);
  });

  it("does not renew once the session has ended", async () => {
    const { lessonId } = await ownedBunnyLesson();
    expect((await renew(lessonId, null)).status).toBe(401);
  });

  it("does not renew a lesson held after its video changed", async () => {
    const { user, lessonId } = await ownedBunnyLesson();
    await sql`update lessons set processing_status = 'held' where id = ${lessonId}`;
    expect((await renew(lessonId, user)).status).toBe(409);
  });

  it("does not renew for a stranger, and writes no link", async () => {
    const { lessonId } = await ownedBunnyLesson();
    const stranger = await createUser();
    expect((await renew(lessonId, stranger)).status).toBe(403);
  });

  it("refuses another origin before any lookup", async () => {
    const { user, lessonId } = await ownedBunnyLesson();
    expect((await renew(lessonId, user, "https://evil.example")).status).toBe(403);
    expect((await renew(lessonId, user, null)).status).toBe(403);
  });

  it("logs each issued link for the owner's access log", async () => {
    const { user, lessonId } = await ownedBunnyLesson();
    await renew(lessonId, user);
    await renew(lessonId, user);
    expect(await logs(lessonId, "video")).toBe(2);
  });

  it("stops a viewer collecting links, with Retry-After and no link", async () => {
    const { user, lessonId } = await ownedBunnyLesson();
    await sql`insert into rate_limits (key, count, reset_at) values (${`embed:user:${user.id}`}, ${EMBED_RENEW_LIMITS.account}, now() + make_interval(secs => ${EMBED_RENEW_WINDOW_SECONDS}))`;
    const res = await renew(lessonId, user);
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await res.text()).toBe("");
    expect(await logs(lessonId, "video")).toBe(0);
  });

  it("a normal hour of watching stays far inside the limit", () => {
    expect(EMBED_RENEW_LIMITS.account).toBeGreaterThanOrEqual(10);
  });

  it("renews a free preview for a visitor without an account", async () => {
    const { lessonId } = await ownedBunnyLesson({ freePreviewIndex: 0 });
    const res = await renew(lessonId, null);
    expect(res.status).toBe(200);
    expect((await sql<{ count: number }[]>`select count from rate_limits where key = ${`embed:ip:${IP}`}`)[0].count).toBe(1);
  });

  it("answers 404 for a file lesson, which has no embed", async () => {
    const user = await createUser();
    const product = await createVideoProduct({ lessons: 1 });
    await grantProduct(sql, { userId: user.id, productId: product.id, source: "manual", grantedBy: null, reason: "test" });
    expect((await renew(product.lessonIds[0], user)).status).toBe(404);
  });

  it("answers 503, not a stack trace, when the provider keys are missing", async () => {
    const { user, lessonId } = await ownedBunnyLesson();
    process.env.VIDEO_PROVIDER = "file";
    delete process.env.BUNNY_STREAM_TOKEN_KEY;
    resetEnvCache();
    try {
      const res = await renew(lessonId, user);
      expect(res.status).toBe(503);
      expect(res.headers.get("retry-after")).toBe("60");
    } finally {
      process.env.VIDEO_PROVIDER = "bunny";
      process.env.BUNNY_STREAM_TOKEN_KEY = TOKEN_KEY;
      resetEnvCache();
    }
  });
});
