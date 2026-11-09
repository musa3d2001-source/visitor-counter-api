import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as tus from "tus-js-client";
import { resetEnvCache } from "@/server/env";
import { createVideo, getVideo, signedEmbedUrl, tusUploadCredentials, BunnyError } from "@/server/video/bunny";
import { activeVideoProvider, handleBunnyWebhook, probeStoredMp4Duration, syncLessonStatus, syncPendingLessons } from "@/server/video/service";
import { checkLessonAccess, playbackFor } from "@/server/access/lessons";
import { startBunnySimulator, type BunnySimulator } from "../mocks/bunny-simulator";
import { closeDb, resetDb, sql } from "../helpers/db";
import { createUser, createVideoProduct, writePrivateVideo } from "../helpers/factories";
import { makeVideoBytes } from "../fixtures/make-video";
import { TEST_ENV } from "../test-env";

let sim: BunnySimulator;
let hook: Server;
let hookUrl = "";
const hookResults: { status: number; result: string }[] = [];
const clip = makeVideoBytes(4, "bunny") ?? new Uint8Array(4096).fill(7);
const clipSeconds = makeVideoBytes(4, "bunny") ? 4 : 42;

beforeAll(async () => {
  await resetDb();
  // خادم صغير يمرر Webhook المحاكي إلى معالج التطبيق الحقيقي
  hook = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", async () => {
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
      const out = await handleBunnyWebhook(Buffer.concat(chunks).toString("utf8"), headers).catch((e) => ({ status: 500, result: String(e) }));
      hookResults.push(out);
      res.writeHead(out.status, { "content-type": "application/json" });
      res.end(JSON.stringify(out));
    });
  });
  await new Promise<void>((r) => hook.listen(0, "127.0.0.1", () => r()));
  hookUrl = `http://127.0.0.1:${(hook.address() as AddressInfo).port}/api/video/bunny/webhook`;
  sim = await startBunnySimulator({ webhookUrl: hookUrl, processingDelayMs: 150, duplicateWebhooks: true });
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
});

afterAll(async () => {
  await sim?.close();
  await new Promise<void>((r) => hook.close(() => r()));
  for (const k of Object.keys(process.env)) if (k.startsWith("BUNNY_") || k === "VIDEO_PROVIDER") delete process.env[k];
  for (const [k, v] of Object.entries(TEST_ENV)) process.env[k] = v;
  resetEnvCache();
  await closeDb();
});

function tusUpload(bytes: Uint8Array, creds: ReturnType<typeof tusUploadCredentials>, chunkSize = 16 * 1024): Promise<void> {
  return new Promise((resolve, reject) => {
    const upload = new tus.Upload(Buffer.from(bytes), {
      endpoint: creds.endpoint,
      headers: creds.headers,
      metadata: { filetype: "video/mp4", title: "درس" },
      chunkSize,
      retryDelays: [],
      onError: reject,
      onSuccess: () => resolve(),
    });
    upload.start();
  });
}

async function waitFor(fn: () => Promise<boolean>, ms = 5000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
}

async function bunnyLesson(guid: string, status = "uploading") {
  const p = await createVideoProduct({ lessons: 0 });
  const [l] = await sql<{ id: string }[]>`
    insert into lessons (product_id, title, provider, video_ref, processing_status, is_published, sort_order)
    values (${p.id}, 'درس Bunny', 'bunny', ${guid}, ${status}, true, 0) returning id
  `;
  return { productId: p.id, lessonId: l.id };
}

describe("Bunny Stream: الإنشاء والرفع المباشر (TUS) والمعالجة", () => {
  it("the configured provider is bunny", () => {
    expect(activeVideoProvider()).toBe("bunny");
  });

  it("create → TUS upload with the official tus-js-client → processing → ready with real duration (webhook drives the sync)", async () => {
    const v = await createVideo("الدرس الأول: الحركة");
    expect(v).toMatchObject({ status: 0, length: 0, videoLibraryId: Number(sim.libraryId) });
    const { lessonId } = await bunnyLesson(v.guid);
    await tusUpload(clip, tusUploadCredentials(v.guid));
    expect((await getVideo(v.guid)).status).toBeLessThan(4);
    // Webhook موقّع من المحاكي ← المعالج الحقيقي ← إعادة استعلام API
    const ok = await waitFor(async () => {
      const [l] = await sql<{ processing_status: string }[]>`select processing_status from lessons where id = ${lessonId}`;
      return l.processing_status === "ready";
    });
    expect(ok).toBe(true);
    const [l] = await sql<{ processing_status: string; duration_seconds: number; processing_error: string | null }[]>`
      select processing_status, duration_seconds, processing_error from lessons where id = ${lessonId}
    `;
    expect(l).toEqual({ processing_status: "ready", duration_seconds: clipSeconds, processing_error: null });
    // نسخة مكررة من الـ webhook تُتجاهل
    await waitFor(async () => hookResults.filter((r) => r.result === "duplicate ignored").length > 0, 2000);
    expect(hookResults.some((r) => r.result === "duplicate ignored")).toBe(true);
  });

  it("TUS rejects a wrong signature or an expired authorization (checked on every request)", async () => {
    const v = await createVideo("مرفوض");
    const good = tusUploadCredentials(v.guid);
    const bad = { ...good, headers: { ...good.headers, AuthorizationSignature: "0".repeat(64) } };
    await expect(tusUpload(clip, bad)).rejects.toThrow(/401/);
    const expired = tusUploadCredentials(v.guid, -60);
    await expect(tusUpload(clip, expired)).rejects.toThrow(/401/);
    expect((await getVideo(v.guid)).status).toBe(0);
  });

  it("failed processing is reported as failed", async () => {
    const v = await createVideo("سيفشل");
    const { lessonId } = await bunnyLesson(v.guid);
    sim.failNext();
    await tusUpload(clip, tusUploadCredentials(v.guid));
    const ok = await waitFor(async () => (await getVideo(v.guid)).status === 5);
    expect(ok).toBe(true);
    expect(await syncLessonStatus(lessonId)).toMatchObject({ status: "failed" });
    const [l] = await sql<{ processing_error: string }[]>`select processing_error from lessons where id = ${lessonId}`;
    expect(l.processing_error).toContain("5");
  });

  it("syncLessonStatus/syncPendingLessons: processing → ready; a deleted video becomes failed", async () => {
    const v = await createVideo("مزامنة يدوية");
    const { lessonId, productId } = await bunnyLesson(v.guid, "processing");
    sim.setStatus(v.guid, 3);
    expect(await syncLessonStatus(lessonId)).toMatchObject({ status: "processing" });
    sim.setStatus(v.guid, 4, 125);
    const synced = await syncPendingLessons(productId);
    expect(synced).toEqual([{ id: lessonId, status: "ready" }]);
    const [l] = await sql<{ duration_seconds: number }[]>`select duration_seconds from lessons where id = ${lessonId}`;
    expect(l.duration_seconds).toBe(125);

    const missing = await bunnyLesson(randomUUID(), "processing");
    expect(await syncLessonStatus(missing.lessonId)).toMatchObject({ status: "failed" });
  });

  it("API calls with a wrong AccessKey fail with BunnyError(401)", async () => {
    process.env.BUNNY_STREAM_API_KEY = "wrong-key";
    resetEnvCache();
    try {
      await expect(createVideo("x")).rejects.toMatchObject({ name: "BunnyError", status: 401 });
      await expect(getVideo(randomUUID())).rejects.toBeInstanceOf(BunnyError);
    } finally {
      process.env.BUNNY_STREAM_API_KEY = sim.apiKey;
      resetEnvCache();
    }
  });
});

describe("Bunny Webhook — التوقيع ومنع التكرار", () => {
  it("valid signature syncs the lesson; replaying the same body is ignored", async () => {
    const v = await createVideo("webhook");
    const { lessonId } = await bunnyLesson(v.guid, "processing");
    sim.setStatus(v.guid, 4, 61);
    const { body, signature } = sim.buildWebhook(v.guid, 3);
    const headers = new Headers({ "x-bunnystream-signature": signature, "x-bunnystream-signature-version": "v1" });
    expect(await handleBunnyWebhook(body, headers)).toEqual({ status: 200, result: "ready" });
    expect(await handleBunnyWebhook(body, headers)).toEqual({ status: 200, result: "duplicate ignored" });
    const [l] = await sql<{ processing_status: string; duration_seconds: number }[]>`select processing_status, duration_seconds from lessons where id = ${lessonId}`;
    expect(l).toEqual({ processing_status: "ready", duration_seconds: 61 });
  });

  it("invalid signature or version → 401 and nothing changes", async () => {
    const v = await createVideo("forged");
    const { lessonId } = await bunnyLesson(v.guid, "processing");
    sim.setStatus(v.guid, 4, 10);
    const forged = sim.buildWebhook(v.guid, 3, "attacker-key");
    expect(await handleBunnyWebhook(forged.body, new Headers({ "x-bunnystream-signature": forged.signature }))).toEqual({ status: 401, result: "invalid signature" });
    const real = sim.buildWebhook(v.guid, 3);
    expect(await handleBunnyWebhook(real.body, new Headers({ "x-bunnystream-signature": real.signature, "x-bunnystream-signature-version": "v9" }))).toMatchObject({ status: 401 });
    expect(await handleBunnyWebhook(real.body, new Headers())).toMatchObject({ status: 401 });
    const [l] = await sql<{ processing_status: string }[]>`select processing_status from lessons where id = ${lessonId}`;
    expect(l.processing_status).toBe("processing");
  });

  it("unknown video, wrong library and malformed bodies", async () => {
    const unknown = sim.buildWebhook(randomUUID(), 3);
    expect(await handleBunnyWebhook(unknown.body, new Headers({ "x-bunnystream-signature": unknown.signature }))).toEqual({ status: 200, result: "unknown video" });
    const wrongLibBody = JSON.stringify({ VideoLibraryId: 1, VideoGuid: randomUUID(), Status: 3 });
    const { createHmac } = await import("node:crypto");
    const sig = createHmac("sha256", sim.readOnlyKey).update(wrongLibBody).digest("hex");
    expect(await handleBunnyWebhook(wrongLibBody, new Headers({ "x-bunnystream-signature": sig }))).toEqual({ status: 400, result: "wrong library" });
    const junk = "not json";
    const junkSig = createHmac("sha256", sim.readOnlyKey).update(junk).digest("hex");
    expect(await handleBunnyWebhook(junk, new Headers({ "x-bunnystream-signature": junkSig }))).toEqual({ status: 400, result: "invalid json" });
  });

  it("without a signing key on a file-provider deployment: accepted as a hint outside production, rejected in production", async () => {
    // مع VIDEO_PROVIDER=bunny لا يبدأ الخادم بدون المفتاح (انظر tests/unit/bunny-startup)، فهذا المسار يبقى لنشر مزوده file وله دروس Bunny قديمة
    delete process.env.BUNNY_STREAM_READONLY_API_KEY;
    process.env.VIDEO_PROVIDER = "file";
    resetEnvCache();
    try {
      const v = await createVideo("hint");
      await bunnyLesson(v.guid, "processing");
      sim.setStatus(v.guid, 4, 30);
      const body = JSON.stringify({ VideoLibraryId: Number(sim.libraryId), VideoGuid: v.guid, Status: 3 });
      expect(await handleBunnyWebhook(body, new Headers())).toEqual({ status: 200, result: "ready" });
      (process.env as Record<string, string>).NODE_ENV = "production";
      resetEnvCache();
      expect(await handleBunnyWebhook(body + " ", new Headers())).toEqual({ status: 401, result: "webhook signing key not configured" });
    } finally {
      (process.env as Record<string, string>).NODE_ENV = "test";
      process.env.VIDEO_PROVIDER = "bunny";
      process.env.BUNNY_STREAM_READONLY_API_KEY = sim.readOnlyKey;
      resetEnvCache();
    }
  });
});

describe("التضمين الموقّع وصلاحية المشاهدة", () => {
  it("signed embed URLs open on the (simulated) Bunny player; tampered or expired tokens get 403", async () => {
    const v = await createVideo("تضمين");
    await tusUpload(clip, tusUploadCredentials(v.guid));
    await waitFor(async () => (await getVideo(v.guid)).status === 4);
    const ok = await fetch(signedEmbedUrl(v.guid));
    expect(ok.status).toBe(200);
    expect(await ok.text()).toContain('data-testid="sim-embed-ok"');
    const tampered = new URL(signedEmbedUrl(v.guid));
    tampered.searchParams.set("token", "f".repeat(64));
    expect((await fetch(tampered)).status).toBe(403);
    expect((await fetch(signedEmbedUrl(v.guid, { ttlSeconds: -5 }))).status).toBe(403);
    const bare = new URL(signedEmbedUrl(v.guid));
    bare.search = "";
    expect((await fetch(bare)).status).toBe(403);
  });

  it("playback for a Bunny lesson is a short-lived signed embed, issued only after the access check", async () => {
    const v = await createVideo("مدفوع");
    const { lessonId, productId } = await bunnyLesson(v.guid, "ready");
    const buyer = await createUser();
    const other = await createUser();
    await sql`insert into entitlements (user_id, product_id, source) values (${buyer.id}, ${productId}, 'purchase')`;
    const allowed = await checkLessonAccess(lessonId, buyer);
    expect(allowed.ok).toBe(true);
    if (allowed.ok) {
      const pb = playbackFor(allowed.lesson, { startAt: 12 });
      expect(pb.kind).toBe("bunny");
      if (pb.kind === "bunny") {
        const u = new URL(pb.embedUrl);
        expect(u.pathname).toBe(`/embed/${sim.libraryId}/${v.guid}`);
        expect(Number(u.searchParams.get("expires"))).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + 3 * 3600 + 5);
        expect(u.searchParams.get("t")).toBe("12");
      }
    }
    expect(await checkLessonAccess(lessonId, other)).toEqual({ ok: false, reason: "forbidden" });
  });
});

describe("فيديو مرفوع على التخزين الخاص (المزود file)", () => {
  it("probeStoredMp4Duration reads the duration of a stored clip", async () => {
    const real = makeVideoBytes(4, "stored");
    if (!real) return; // ffmpeg غير متوفر
    const key = `lessons/${randomUUID()}/${randomUUID()}.mp4`;
    writePrivateVideo(key, real);
    expect(await probeStoredMp4Duration(key, real.length)).toBe(4);
    const junkKey = `lessons/${randomUUID()}/${randomUUID()}.mp4`;
    writePrivateVideo(junkKey, new Uint8Array(2048));
    expect(await probeStoredMp4Duration(junkKey, 2048)).toBeNull();
  });
});
