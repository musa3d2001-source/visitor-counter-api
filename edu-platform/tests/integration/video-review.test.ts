import { createHmac } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { acceptHeldVideo, approveAndPublish, publishBlockers, setProductStatus } from "@/server/admin/products";
import { checkLessonAccess } from "@/server/access/lessons";
import { getDb } from "@/server/db";
import { saleStopReason } from "@/server/commerce/cart";
import { resetEnvCache } from "@/server/env";
import { createVideo, getVideo, TUS_CREDENTIAL_TTL_SECONDS, tusUploadCredentials } from "@/server/video/bunny";
import { DAILY_VIDEO_CHECK, dailyVideoCheck, handleBunnyWebhook, syncLessonStatus } from "@/server/video/service";
import { BUNNY_WEBHOOK_REJECTIONS_PER_ADDRESS, resetBunnyWebhookGate } from "@/server/video/webhook-gate";
import { runDataPruning, VIDEO_EVENT_RETENTION_DAYS } from "@/server/platform/maintenance";
import type { Actor } from "@/server/auth/permissions";
import { startBunnySimulator, type BunnySimulator } from "../mocks/bunny-simulator";
import { closeDb, resetDb, sql } from "../helpers/db";
import { createBundle, createUser, createVideoProduct } from "../helpers/factories";
import { TEST_ENV } from "../test-env";

const { POST } = await import("@/app/api/video/bunny/webhook/route");

let sim: BunnySimulator;
let owner: Actor;

const A = new Uint8Array(4096).fill(1);
const B = new Uint8Array(4096).fill(2);

beforeAll(async () => {
  await resetDb();
  sim = await startBunnySimulator({ processingDelayMs: 20 });
  Object.assign(process.env, {
    VIDEO_PROVIDER: "bunny",
    BUNNY_STREAM_LIBRARY_ID: sim.libraryId,
    BUNNY_STREAM_API_KEY: sim.apiKey,
    BUNNY_STREAM_TOKEN_KEY: sim.tokenKey,
    BUNNY_STREAM_READONLY_API_KEY: sim.readOnlyKey,
    BUNNY_STREAM_API_BASE: sim.url,
    BUNNY_STREAM_TUS_ENDPOINT: `${sim.url}/tusupload`,
    BUNNY_STREAM_EMBED_BASE: sim.url,
  });
  resetEnvCache();
  const admin = await createUser({ role: "admin" });
  owner = { kind: "owner", userId: admin.id, name: admin.fullName, email: admin.email, teacherId: null, canUpload: true };
});

afterAll(async () => {
  await sim?.close();
  for (const k of Object.keys(process.env)) if (k.startsWith("BUNNY_") || k === "VIDEO_PROVIDER") delete process.env[k];
  for (const [k, v] of Object.entries(TEST_ENV)) process.env[k] = v;
  resetEnvCache();
  await closeDb();
});

beforeEach(() => {
  resetBunnyWebhookGate();
  sim.failApi(null);
});
afterEach(() => {
  sim.failApi(null);
});

/** رفع كامل بتوقيع صحيح، كما يفعل من يملك توقيعًا ساريًا */
async function upload(guid: string, bytes: Uint8Array) {
  const creds = tusUploadCredentials(guid);
  const res = await fetch(creds.endpoint, {
    method: "POST",
    headers: { ...creds.headers, "Tus-Resumable": "1.0.0", "Upload-Length": String(bytes.length), "Content-Type": "application/offset+octet-stream" },
    body: Buffer.from(bytes),
  });
  expect(res.status).toBe(201);
  const until = Date.now() + 3000;
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, 15));
    if (sim.state.videos.get(guid)?.status === 4 && sim.state.videos.get(guid)?.bytes?.[0] === bytes[0]) return;
  }
  throw new Error("simulated encode did not finish");
}

/** درس جاهز ومعتمد على بصمة الفيديو A */
async function approvedLesson(status: "published" | "draft" | "in_review" | "hidden" | "archived" = "published") {
  const v = await createVideo("درس");
  const product = await createVideoProduct({ lessons: 1, provider: "bunny", videoRefs: [v.guid], status });
  const lessonId = product.lessonIds[0];
  await upload(v.guid, A);
  expect((await syncLessonStatus(lessonId))?.status).toBe("ready");
  return { guid: v.guid, lessonId, productId: product.id };
}

const lessonOf = async (id: string) => (await sql<{ processing_status: string; video_fingerprint: { originalHash: string | null } | null; video_hold_fingerprint: { originalHash: string | null } | null }[]>`select processing_status, video_fingerprint, video_hold_fingerprint from lessons where id = ${id}`)[0];
const auditCount = async (action: string, lessonId: string) => (await sql<{ n: number }[]>`select count(*)::int as n from audit_logs where action = ${action} and metadata->>'lessonId' = ${lessonId}`)[0].n;

function webhook(guid: string, status = 3, tag = "") {
  const { body, signature } = sim.buildWebhook(guid, status);
  const raw = tag ? JSON.stringify({ ...JSON.parse(body), EventId: tag }) : body;
  const sig = tag ? createHmac("sha256", sim.readOnlyKey).update(raw, "utf8").digest("hex") : signature;
  return { raw, headers: new Headers({ "x-bunnystream-signature": sig, "x-bunnystream-signature-version": "v1", "x-bunnystream-signature-algorithm": "hmac-sha256" }) };
}

function postWebhook(init: { body: BodyInit; headers?: Record<string, string>; ip?: string }) {
  return POST(new NextRequest("http://localhost/api/video/bunny/webhook", { method: "POST", body: init.body, headers: { "x-forwarded-for": init.ip ?? "198.51.100.9", ...init.headers }, duplex: "half" } as never));
}

describe("the upload credential", () => {
  it("lasts 1 to 2 hours", () => {
    expect(TUS_CREDENTIAL_TTL_SECONDS).toBeGreaterThanOrEqual(3600);
    expect(TUS_CREDENTIAL_TTL_SECONDS).toBeLessThanOrEqual(7200);
    const c = tusUploadCredentials("00000000-0000-4000-8000-000000000000");
    const left = c.expire - Math.floor(Date.now() / 1000);
    expect(left).toBeGreaterThan(TUS_CREDENTIAL_TTL_SECONDS - 5);
    expect(left).toBeLessThanOrEqual(TUS_CREDENTIAL_TTL_SECONDS);
  });
});

describe("a video replaced after approval goes back to review", () => {
  it("holds the lesson when the provider reports the new upload, and keeps the approved fingerprint", async () => {
    const { guid, lessonId, productId } = await approvedLesson();
    const approved = (await lessonOf(lessonId)).video_fingerprint!;
    expect(approved.originalHash).toBeTruthy();
    await upload(guid, B);
    const hook = webhook(guid, 3, "replaced-1");
    expect(await handleBunnyWebhook(hook.raw, hook.headers)).toEqual({ status: 200, result: "held" });
    const row = await lessonOf(lessonId);
    expect(row.processing_status).toBe("held");
    expect(row.video_fingerprint).toEqual(approved);
    expect(row.video_hold_fingerprint!.originalHash).not.toBe(approved.originalHash);
    expect(await auditCount("lesson.video_changed", lessonId)).toBe(1);
    expect(await saleStopReason(productId)).toBe("defect");
  });

  it("catches it in the daily job when the webhook never arrives", async () => {
    const { guid, lessonId } = await approvedLesson();
    await sql`update lessons set status_checked_at = now() - interval '3650 days' where id = ${lessonId}`;
    await upload(guid, B);
    const report = await dailyVideoCheck();
    expect(report.held).toBeGreaterThanOrEqual(1);
    expect((await lessonOf(lessonId)).processing_status).toBe("held");
  });

  it("hides the held lesson from a buyer, and lets the owner still review it", async () => {
    const { guid, lessonId, productId } = await approvedLesson();
    const buyer = await createUser();
    await sql`insert into entitlements (user_id, product_id, source) values (${buyer.id}, ${productId}, 'purchase')`;
    expect((await checkLessonAccess(lessonId, buyer)).ok).toBe(true);
    await upload(guid, B);
    await syncLessonStatus(lessonId);
    expect(await checkLessonAccess(lessonId, buyer)).toEqual({ ok: false, reason: "not_ready" });
    const admin = await createUser({ role: "admin" });
    expect((await checkLessonAccess(lessonId, admin)).ok).toBe(true);
  });

  it("stops the sale of a bundle that contains the held lesson", async () => {
    const { guid, lessonId, productId } = await approvedLesson();
    const bundle = await createBundle({ items: [productId] });
    expect(await saleStopReason(bundle.id)).toBeNull();
    await upload(guid, B);
    await syncLessonStatus(lessonId);
    expect(await saleStopReason(bundle.id)).toBe("defect");
  });

  it("holds once however many deliveries race", async () => {
    const { guid, lessonId } = await approvedLesson();
    await upload(guid, B);
    await Promise.all([syncLessonStatus(lessonId), syncLessonStatus(lessonId), syncLessonStatus(lessonId)]);
    expect((await lessonOf(lessonId)).processing_status).toBe("held");
    expect(await auditCount("lesson.video_changed", lessonId)).toBe(1);
  });

  it("does not release a held lesson on any later sync", async () => {
    const { guid, lessonId } = await approvedLesson();
    await upload(guid, B);
    await syncLessonStatus(lessonId);
    expect((await syncLessonStatus(lessonId))?.status).toBe("held");
    const hook = webhook(guid, 3, "after-hold");
    expect((await handleBunnyWebhook(hook.raw, hook.headers)).result).toBe("held");
    expect((await lessonOf(lessonId)).processing_status).toBe("held");
  });

  it("stays held until the owner decides, even if the file returns to the approved one or Bunny reports a failure", async () => {
    const { guid, lessonId } = await approvedLesson();
    await upload(guid, B);
    await syncLessonStatus(lessonId);
    await upload(guid, A);
    expect((await syncLessonStatus(lessonId))?.status).toBe("held");
    expect((await lessonOf(lessonId)).processing_status).toBe("held");
    sim.setStatus(guid, 5);
    expect((await syncLessonStatus(lessonId))?.status).toBe("held");
    expect((await lessonOf(lessonId)).processing_status).toBe("held");
    sim.state.videos.delete(guid);
    expect((await syncLessonStatus(lessonId))?.status).toBe("held");
    expect((await lessonOf(lessonId)).processing_status).toBe("held");
  });

  it("a lesson mid-encode of a replacement is not ready, and never slips through as ready", async () => {
    const { guid, lessonId } = await approvedLesson();
    sim.setStatus(guid, 3);
    expect((await syncLessonStatus(lessonId))?.status).toBe("processing");
    await upload(guid, B);
    expect((await syncLessonStatus(lessonId))?.status).toBe("held");
  });

  it.each(["in_review", "hidden", "archived"] as const)("applies to a product that is %s", async (status) => {
    const { guid, lessonId } = await approvedLesson(status);
    await upload(guid, B);
    expect((await syncLessonStatus(lessonId))?.status).toBe("held");
  });
});

describe("what does not count as a replacement", () => {
  it("re-reading the same video, even after Bunny adds resolutions and its stored size grows", async () => {
    const { guid, lessonId } = await approvedLesson();
    const v = sim.state.videos.get(guid)!;
    v.storageSize += 500_000;
    v.availableResolutions = "240p,720p";
    expect((await syncLessonStatus(lessonId))?.status).toBe("ready");
    expect(await auditCount("lesson.video_changed", lessonId)).toBe(0);
  });

  it("a teacher replacing a video in a draft re-pins silently", async () => {
    const { guid, lessonId } = await approvedLesson("draft");
    const first = (await lessonOf(lessonId)).video_fingerprint!;
    await upload(guid, B);
    expect((await syncLessonStatus(lessonId))?.status).toBe("ready");
    expect((await lessonOf(lessonId)).video_fingerprint!.originalHash).not.toBe(first.originalHash);
  });

  it("the first time a lesson becomes ready just records its fingerprint", async () => {
    const v = await createVideo("أول مرة");
    const product = await createVideoProduct({ lessons: 1, provider: "bunny", videoRefs: [v.guid], status: "published" });
    await upload(v.guid, A);
    expect((await syncLessonStatus(product.lessonIds[0]))?.status).toBe("ready");
    expect((await lessonOf(product.lessonIds[0])).video_fingerprint).toBeTruthy();
  });

  it("without a hash from the provider, the upload date and dimensions decide", async () => {
    const { guid, lessonId } = await approvedLesson();
    await sql`update lessons set video_fingerprint = video_fingerprint || '{"originalHash": null}'::jsonb where id = ${lessonId}`;
    expect((await syncLessonStatus(lessonId))?.status).toBe("ready");
    sim.state.videos.get(guid)!.originalHash = null;
    sim.state.videos.get(guid)!.dateUploaded = new Date(Date.now() + 60_000).toISOString();
    expect((await syncLessonStatus(lessonId))?.status).toBe("held");
  });
});

describe("approval sees what is really in Bunny", () => {
  const approval = (submittedAt: string | null) => ({ submittedAt, priceFils: 4000, compareAtPriceFils: null, accessMode: "unlimited" as const, accessUntil: null, accessDays: null });
  async function inReview() {
    const made = await approvedLesson("in_review");
    const [{ submitted_at }] = await sql<{ submitted_at: Date }[]>`update products set submitted_at = now() where id = ${made.productId} returning submitted_at`;
    return { ...made, submittedAt: submitted_at.toISOString() };
  }

  it("refuses when the video changed and the webhook was lost", async () => {
    const { guid, productId, lessonId, submittedAt } = await inReview();
    await upload(guid, B);
    await expect(approveAndPublish(productId, approval(submittedAt), owner)).rejects.toThrow("تغيّر ملف فيديو");
    expect((await sql`select status from products where id = ${productId}`)[0].status).toBe("in_review");
    expect((await lessonOf(lessonId)).processing_status).toBe("held");
  });

  it("refuses when Bunny cannot confirm, rather than assuming the video is intact", async () => {
    const { productId, submittedAt } = await inReview();
    sim.failApi(500);
    await expect(approveAndPublish(productId, approval(submittedAt), owner)).rejects.toThrow("تعذر التحقق");
    expect((await sql`select status from products where id = ${productId}`)[0].status).toBe("in_review");
  });

  it("approves when the video is the one submitted", async () => {
    const { productId, submittedAt } = await inReview();
    await approveAndPublish(productId, approval(submittedAt), owner);
    expect((await sql`select status from products where id = ${productId}`)[0].status).toBe("published");
  });

  it("a direct publish checks too", async () => {
    const { guid, productId } = await approvedLesson("hidden");
    await upload(guid, B);
    await expect(setProductStatus(productId, "published", owner)).rejects.toThrow("تغيّر ملف فيديو");
  });

  it("a held lesson that is itself hidden does not block publishing the rest", async () => {
    const { guid, productId, lessonId } = await approvedLesson("hidden");
    await upload(guid, B);
    await syncLessonStatus(lessonId);
    await sql`update lessons set is_published = false where id = ${lessonId}`;
    expect((await publishBlockers(productId)).join(" ")).not.toContain("تغيّر ملف فيديو");
  });
});

describe("the owner's decision", () => {
  it("accepting returns the lesson to students with the new fingerprint, and it stays ready", async () => {
    const { guid, lessonId, productId } = await approvedLesson();
    await upload(guid, B);
    await syncLessonStatus(lessonId);
    await acceptHeldVideo(productId, lessonId, owner);
    const row = await lessonOf(lessonId);
    expect(row.processing_status).toBe("ready");
    expect(row.video_hold_fingerprint).toBeNull();
    expect(row.video_fingerprint!.originalHash).toBe((await getVideo(guid)).originalHash);
    expect(await auditCount("lesson.video_accepted", lessonId)).toBe(1);
    expect((await syncLessonStatus(lessonId))?.status).toBe("ready");
    expect(await saleStopReason(productId)).toBeNull();
  });

  it("a teacher cannot accept", async () => {
    const { guid, lessonId, productId } = await approvedLesson();
    await upload(guid, B);
    await syncLessonStatus(lessonId);
    const teacher = { kind: "teacher", userId: owner.userId, name: "t", email: "t@t", teacherId: "00000000-0000-4000-8000-000000000000", canUpload: true } as unknown as Actor;
    await expect(acceptHeldVideo(productId, lessonId, teacher)).rejects.toThrow("إدارة المنصة");
    expect((await lessonOf(lessonId)).processing_status).toBe("held");
  });

  it("refuses to accept a video that changed again since it was held, until it has been seen", async () => {
    const { guid, lessonId, productId } = await approvedLesson();
    await upload(guid, B);
    await syncLessonStatus(lessonId);
    await upload(guid, new Uint8Array(4096).fill(3));
    await expect(acceptHeldVideo(productId, lessonId, owner)).rejects.toThrow("مرة أخرى");
    expect((await lessonOf(lessonId)).processing_status).toBe("held");
    await acceptHeldVideo(productId, lessonId, owner);
    expect((await lessonOf(lessonId)).processing_status).toBe("ready");
  });

  it("refuses while Bunny cannot confirm, or the video is still encoding, or nothing is held", async () => {
    const { guid, lessonId, productId } = await approvedLesson();
    await expect(acceptHeldVideo(productId, lessonId, owner)).rejects.toThrow("لا يوجد فيديو");
    await upload(guid, B);
    await syncLessonStatus(lessonId);
    sim.failApi(503);
    await expect(acceptHeldVideo(productId, lessonId, owner)).rejects.toThrow("تعذر الوصول");
    sim.failApi(null);
    sim.setStatus(guid, 3);
    await expect(acceptHeldVideo(productId, lessonId, owner)).rejects.toThrow("لم تكتمل");
    expect((await lessonOf(lessonId)).processing_status).toBe("held");
  });
});

describe("the provider webhook", () => {
  const eventsOf = async (key: string) => sql<{ result: string | null }[]>`select result from video_events where payload->>'EventId' = ${key}`;

  it("a webhook whose sync failed is processed again on retry, and is seen only after it succeeded", async () => {
    const v = await createVideo("إعادة");
    const product = await createVideoProduct({ lessons: 1, provider: "bunny", videoRefs: [v.guid], ready: false, status: "draft" });
    const lessonId = product.lessonIds[0];
    await upload(v.guid, A);
    const hook = webhook(v.guid, 3, "retry-1");

    sim.failApi(500);
    await expect(handleBunnyWebhook(hook.raw, hook.headers)).rejects.toThrow();
    expect(await eventsOf("retry-1")).toEqual([]);
    expect((await lessonOf(lessonId)).processing_status).not.toBe("ready");

    sim.failApi(null);
    expect(await handleBunnyWebhook(hook.raw, hook.headers)).toEqual({ status: 200, result: "ready" });
    expect((await lessonOf(lessonId)).processing_status).toBe("ready");
    expect(await eventsOf("retry-1")).toEqual([{ result: "ready" }]);

    expect(await handleBunnyWebhook(hook.raw, hook.headers)).toEqual({ status: 200, result: "duplicate ignored" });
  });

  it("answers 500 through the route while the sync fails, so Bunny retries, then 200", async () => {
    const v = await createVideo("عبر المسار");
    await createVideoProduct({ lessons: 1, provider: "bunny", videoRefs: [v.guid], ready: false, status: "draft" });
    await upload(v.guid, A);
    const hook = webhook(v.guid, 3, "route-retry");
    const headers = Object.fromEntries(hook.headers.entries());
    sim.failApi(502);
    const failed = await postWebhook({ body: hook.raw, headers });
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({ error: "internal" });
    sim.failApi(null);
    expect((await postWebhook({ body: hook.raw, headers })).status).toBe(200);
  });

  it("re-processes a row an older deployment left without a result", async () => {
    const v = await createVideo("قديم");
    const product = await createVideoProduct({ lessons: 1, provider: "bunny", videoRefs: [v.guid], ready: false, status: "draft" });
    await upload(v.guid, A);
    const hook = webhook(v.guid, 3, "legacy-row");
    const { createHash } = await import("node:crypto");
    await sql`insert into video_events (provider, event_key, payload) values ('bunny', ${createHash("sha256").update(hook.raw).digest("hex")}, ${sql.json({ EventId: "legacy-row" })})`;
    expect((await handleBunnyWebhook(hook.raw, hook.headers)).result).toBe("ready");
    expect((await lessonOf(product.lessonIds[0])).processing_status).toBe("ready");
  });

  it("two different events for one video are both processed", async () => {
    const v = await createVideo("حدثان");
    await createVideoProduct({ lessons: 1, provider: "bunny", videoRefs: [v.guid], ready: false, status: "draft" });
    await upload(v.guid, A);
    const one = webhook(v.guid, 3, "e-1");
    const two = webhook(v.guid, 3, "e-2");
    expect((await handleBunnyWebhook(one.raw, one.headers)).result).toBe("ready");
    expect((await handleBunnyWebhook(two.raw, two.headers)).result).toBe("ready");
  });

  it("checks the signature before any work: no database statement and no call to Bunny", async () => {
    const v = await createVideo("توقيع");
    const hook = webhook(v.guid, 3, "bad-sig");
    hook.headers.set("x-bunnystream-signature", "0".repeat(64));
    const before = sim.state.requests.length;
    const db = getDb();
    let statements = 0;
    (db.options as { debug?: unknown }).debug = () => {
      statements++;
    };
    const out = await handleBunnyWebhook(hook.raw, hook.headers);
    (db.options as { debug?: unknown }).debug = undefined;
    expect(out.status).toBe(401);
    expect(statements).toBe(0);
    expect(sim.state.requests.length).toBe(before);
  });

  it("refuses by Content-Length without reading the body", async () => {
    const pulled = vi.fn();
    const body = new ReadableStream({ pull: (c) => (pulled(), c.close()) }, { highWaterMark: 0 });
    const res = await postWebhook({ body, headers: { "content-length": String(64 * 1024 + 1) } });
    expect(res.status).toBe(413);
    expect(pulled).not.toHaveBeenCalled();
  });

  it("stops reading once a body with no declared length passes the cap", async () => {
    let chunks = 0;
    const body = new ReadableStream({
      pull(c) {
        chunks++;
        if (chunks > 1000) return c.close();
        c.enqueue(new Uint8Array(16 * 1024));
      },
    });
    const res = await postWebhook({ body });
    expect(res.status).toBe(413);
    expect(chunks).toBeLessThan(10);
  });

  it("after repeated bad signatures from one address, refuses before reading, and spares others", async () => {
    const v = await createVideo("حاجز");
    const hook = webhook(v.guid, 3, "gate");
    const headers = { ...Object.fromEntries(hook.headers.entries()), "x-bunnystream-signature": "1".repeat(64) };
    for (let i = 0; i < BUNNY_WEBHOOK_REJECTIONS_PER_ADDRESS; i++) expect((await postWebhook({ body: hook.raw, headers, ip: "198.51.100.77" })).status).toBe(401);
    const pulled = vi.fn();
    const refused = await postWebhook({ body: new ReadableStream({ pull: (c) => (pulled(), c.close()) }, { highWaterMark: 0 }), headers, ip: "198.51.100.77" });
    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(pulled).not.toHaveBeenCalled();
    expect((await postWebhook({ body: hook.raw, headers, ip: "198.51.100.78" })).status).toBe(401);
  });

  it("signed events are never counted against Bunny's address", async () => {
    const v = await createVideo("موقّع");
    await createVideoProduct({ lessons: 1, provider: "bunny", videoRefs: [v.guid], ready: false, status: "draft" });
    await upload(v.guid, A);
    for (let i = 0; i < BUNNY_WEBHOOK_REJECTIONS_PER_ADDRESS + 5; i++) {
      const hook = webhook(v.guid, 3, `many-${i}`);
      expect((await postWebhook({ body: hook.raw, headers: Object.fromEntries(hook.headers.entries()), ip: "198.51.100.90" })).status).toBe(200);
    }
  });
});

describe("the daily job", () => {
  it("re-syncs a lesson still pending because its webhook was lost", async () => {
    const v = await createVideo("معلق");
    const product = await createVideoProduct({ lessons: 1, provider: "bunny", videoRefs: [v.guid], ready: false, status: "draft" });
    await upload(v.guid, A);
    await sql`update lessons set status_checked_at = null where id = ${product.lessonIds[0]}`;
    const report = await runDataPruning();
    expect(report.videos.checked).toBeGreaterThanOrEqual(1);
    expect((await lessonOf(product.lessonIds[0])).processing_status).toBe("ready");
  });

  it("does not let Bunny being down fail the cleanup, and stops after a few failures in a row", async () => {
    await createVideoProduct({ lessons: 1, provider: "bunny", videoRefs: [crypto.randomUUID()], ready: false, status: "draft" });
    await createVideoProduct({ lessons: 1, provider: "bunny", videoRefs: [crypto.randomUUID()], ready: false, status: "draft" });
    await createVideoProduct({ lessons: 1, provider: "bunny", videoRefs: [crypto.randomUUID()], ready: false, status: "draft" });
    await createVideoProduct({ lessons: 1, provider: "bunny", videoRefs: [crypto.randomUUID()], ready: false, status: "draft" });
    sim.failApi(500);
    const before = sim.state.requests.length;
    const report = await runDataPruning();
    expect(report.videos.failed).toBe(DAILY_VIDEO_CHECK.stopAfterFailures);
    expect(report.videos.finished).toBe(false);
    expect(report.finished).toBe(false);
    expect(sim.state.requests.length - before).toBe(DAILY_VIDEO_CHECK.stopAfterFailures);
  });

  it("removes old webhook records and keeps recent ones", async () => {
    await sql`insert into video_events (provider, event_key, payload, result, received_at) values ('bunny', 'old-one', '{}', 'ready', now() - make_interval(days => ${VIDEO_EVENT_RETENTION_DAYS + 1})), ('bunny', 'new-one', '{}', 'ready', now())`;
    await runDataPruning();
    const keys = (await sql<{ event_key: string }[]>`select event_key from video_events where event_key in ('old-one', 'new-one')`).map((r) => r.event_key);
    expect(keys).toEqual(["new-one"]);
  });
});
