import { createHash, createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mp4DurationSeconds } from "@/server/video/mp4";
import { mapBunnyStatus, signedEmbedUrl, tusUploadCredentials, verifyBunnyWebhookSignature } from "@/server/video/bunny";
import { resetEnvCache } from "@/server/env";
import { makeVideoBytes } from "../fixtures/make-video";
import { TEST_ENV } from "../test-env";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

function box(type: string, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + payload.length);
  new DataView(out.buffer).setUint32(0, out.length);
  out.set([...type].map((c) => c.charCodeAt(0)), 4);
  out.set(payload, 8);
  return out;
}

function mvhd(version: 0 | 1, timescale: number, duration: number): Uint8Array {
  const len = version === 1 ? 4 + 8 + 8 + 4 + 8 + 80 : 4 + 4 + 4 + 4 + 4 + 80;
  const p = new Uint8Array(len);
  const v = new DataView(p.buffer);
  p[0] = version;
  if (version === 1) {
    v.setUint32(20, timescale);
    v.setBigUint64(24, BigInt(duration));
  } else {
    v.setUint32(12, timescale);
    v.setUint32(16, duration);
  }
  return box("mvhd", p);
}

function concat(...parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

describe("mp4DurationSeconds", () => {
  it("reads the duration of a real ffmpeg clip", () => {
    const bytes = makeVideoBytes(4, "unit");
    if (!bytes) return; // ffmpeg غير متوفر
    expect(mp4DurationSeconds(bytes)).toBe(4);
  });

  it("parses version 0 and version 1 mvhd boxes", () => {
    const ftyp = box("ftyp", new TextEncoder().encode("isom\0\0\0\0isom"));
    expect(mp4DurationSeconds(concat(ftyp, box("moov", mvhd(0, 1000, 125_400))))).toBe(125);
    expect(mp4DurationSeconds(concat(ftyp, box("moov", mvhd(1, 90000, 90000 * 3600))))).toBe(3600);
  });

  it("finds mvhd in a tail-only buffer (moov at the end of the file)", () => {
    const tail = concat(new Uint8Array(4096), box("moov", mvhd(0, 600, 600 * 75)));
    expect(mp4DurationSeconds(tail)).toBe(75);
  });

  it("returns null for garbage, truncated input, or a zero timescale", () => {
    expect(mp4DurationSeconds(new TextEncoder().encode("this is not a video at all"))).toBeNull();
    expect(mp4DurationSeconds(new Uint8Array(0))).toBeNull();
    expect(mp4DurationSeconds(box("moov", mvhd(0, 1000, 5000)).slice(0, 20))).toBeNull();
    expect(mp4DurationSeconds(box("moov", mvhd(0, 0, 5000)))).toBeNull();
  });
});

describe("Bunny Stream signing", () => {
  beforeAll(() => {
    process.env.BUNNY_STREAM_LIBRARY_ID = "759";
    process.env.BUNNY_STREAM_API_KEY = "api-key-secret";
    process.env.BUNNY_STREAM_TOKEN_KEY = "token-key-secret";
    process.env.BUNNY_STREAM_TUS_ENDPOINT = "https://video.bunnycdn.com/tusupload";
    process.env.BUNNY_STREAM_EMBED_BASE = "https://iframe.mediadelivery.net";
    resetEnvCache();
  });
  afterAll(() => {
    for (const k of Object.keys(process.env)) if (k.startsWith("BUNNY_")) delete process.env[k];
    for (const [k, v] of Object.entries(TEST_ENV)) process.env[k] = v;
    resetEnvCache();
  });

  const vid = "0273f24a-79d1-d0fe-97ca-b0e36bed31e1";

  it("TUS signature = SHA256_HEX(libraryId + apiKey + expire + videoId)", () => {
    const before = Math.floor(Date.now() / 1000);
    const c = tusUploadCredentials(vid, 3600);
    expect(c.endpoint).toBe("https://video.bunnycdn.com/tusupload");
    expect(c.headers.VideoId).toBe(vid);
    expect(c.headers.LibraryId).toBe("759");
    expect(Number(c.headers.AuthorizationExpire)).toBeGreaterThanOrEqual(before + 3600);
    expect(c.headers.AuthorizationSignature).toBe(sha(`759api-key-secret${c.headers.AuthorizationExpire}${vid}`));
    // المفتاح السري لا يظهر في أي ترويسة
    expect(JSON.stringify(c)).not.toContain("api-key-secret");
  });

  it("embed token = SHA256_HEX(tokenKey + videoId + expires) on iframe.mediadelivery.net", () => {
    const u = new URL(signedEmbedUrl(vid, { ttlSeconds: 600, startAt: 95.7 }));
    expect(u.origin).toBe("https://iframe.mediadelivery.net");
    expect(u.pathname).toBe(`/embed/759/${vid}`);
    const expires = u.searchParams.get("expires")!;
    expect(Number(expires)).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(u.searchParams.get("token")).toBe(sha(`token-key-secret${vid}${expires}`));
    expect(u.searchParams.get("t")).toBe("95");
    expect(u.toString()).not.toContain("token-key-secret");
  });

  it("webhook signature: hex HMAC-SHA256 of the raw body with the read-only key, version v1", () => {
    const body = JSON.stringify({ VideoLibraryId: 759, VideoGuid: vid, Status: 3 });
    const sig = createHmac("sha256", "ro-key").update(body).digest("hex");
    expect(verifyBunnyWebhookSignature(body, sig, "v1", "ro-key")).toBe(true);
    expect(verifyBunnyWebhookSignature(body, sig.toUpperCase(), "v1", "ro-key")).toBe(true);
    expect(verifyBunnyWebhookSignature(body, sig, null, "ro-key")).toBe(true);
    expect(verifyBunnyWebhookSignature(body, sig, "v2", "ro-key")).toBe(false);
    expect(verifyBunnyWebhookSignature(body + " ", sig, "v1", "ro-key")).toBe(false);
    expect(verifyBunnyWebhookSignature(body, sig, "v1", "other-key")).toBe(false);
    expect(verifyBunnyWebhookSignature(body, null, "v1", "ro-key")).toBe(false);
    expect(verifyBunnyWebhookSignature(body, sig, "v1", "")).toBe(false);
  });

  it("maps every video-object status to our processing state", () => {
    const m = (s: number) => mapBunnyStatus({ status: s });
    expect(m(0)).toBe("uploading");
    expect([1, 2, 3, 7, 8].map(m)).toEqual(["processing", "processing", "processing", "processing", "processing"]);
    expect(m(4)).toBe("ready");
    expect(m(5)).toBe("failed");
    expect(m(6)).toBe("failed");
    expect(m(99)).toBe("processing");
  });
});
