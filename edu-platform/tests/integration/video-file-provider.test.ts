import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { grantProduct } from "@/server/access/entitlements";
import { resetEnvCache } from "@/server/env";
import { storage } from "@/server/storage";
import { paidVideoWithoutStreaming } from "@/server/video/policy";
import { closeDb, resetDb, sql } from "../helpers/db";
import { createUser, createVideoProduct } from "../helpers/factories";

const session = vi.hoisted(() => ({ user: null as null | { id: string; email: string; role: string } }));
vi.mock("@/server/auth/session", async (original) => ({ ...(await original<typeof import("@/server/auth/session")>()), getCurrentUser: async () => session.user }));

const { GET } = await import("@/app/api/lessons/[lessonId]/stream/route");

beforeAll(resetDb);
afterAll(closeDb);
beforeEach(() => sql`delete from rate_limits`);
afterEach(() => {
  session.user = null;
  vi.restoreAllMocks();
  resetEnvCache();
});

describe("the file provider's signed link", () => {
  it("is short: at most five minutes, and only after the access check", async () => {
    const user = await createUser();
    const product = await createVideoProduct({ lessons: 1 });
    await grantProduct(sql, { userId: user.id, productId: product.id, source: "manual", grantedBy: null, reason: "test" });
    const signed = vi.spyOn(storage(), "signedUrl").mockResolvedValue("https://storage.example/signed");
    session.user = user;
    const lessonId = product.lessonIds[0];
    const res = await GET(new NextRequest(`http://localhost/api/lessons/${lessonId}/stream`), { params: Promise.resolve({ lessonId }) });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://storage.example/signed");
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(signed).toHaveBeenCalledTimes(1);
    expect(signed.mock.calls[0][2]).toBeLessThanOrEqual(300);
    expect(signed.mock.calls[0][2]).toBeGreaterThanOrEqual(60);

    session.user = await createUser();
    expect((await GET(new NextRequest(`http://localhost/api/lessons/${lessonId}/stream`), { params: Promise.resolve({ lessonId }) })).status).toBe(403);
    expect(signed).toHaveBeenCalledTimes(1);
  });
});

describe("the count behind the owner's warning", () => {
  it("counts a published paid product with a raw lesson, once however many lessons it has", async () => {
    const before = await paidVideoWithoutStreaming(sql, true);
    await createVideoProduct({ lessons: 3, status: "published", priceFils: 4000 });
    expect(await paidVideoWithoutStreaming(sql, true)).toBe(before + 1);
  });

  it("ignores free products, drafts and hidden lessons", async () => {
    const before = await paidVideoWithoutStreaming(sql, true);
    const free = await createVideoProduct({ lessons: 1, status: "published", priceFils: 0 });
    await sql`update products set is_free = true where id = ${free.id}`;
    await createVideoProduct({ lessons: 1, status: "draft", priceFils: 4000 });
    const hidden = await createVideoProduct({ lessons: 1, status: "published", priceFils: 4000 });
    await sql`update lessons set is_published = false where product_id = ${hidden.id}`;
    expect(await paidVideoWithoutStreaming(sql, true)).toBe(before);
  });

  it("a Bunny lesson counts only when the deployment cannot stream it", async () => {
    const before = await paidVideoWithoutStreaming(sql, true);
    const beforeNoKeys = await paidVideoWithoutStreaming(sql, false);
    await createVideoProduct({ lessons: 1, status: "published", priceFils: 4000, provider: "bunny", videoRefs: [crypto.randomUUID()] });
    expect(await paidVideoWithoutStreaming(sql, true)).toBe(before);
    expect(await paidVideoWithoutStreaming(sql, false)).toBe(beforeNoKeys + 1);
  });
});
