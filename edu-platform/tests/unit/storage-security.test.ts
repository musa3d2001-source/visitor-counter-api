import { describe, expect, it, vi } from "vitest";
import { newStorageKey, sniffMime, UPLOAD_RULES } from "@/server/storage";
import { assertSafeKey } from "@/server/storage/types";
import { createLocalUploadToken, verifyLocalUploadToken, type LocalUploadClaims } from "@/server/storage/local";

const bytes = (...xs: (number | string)[]) =>
  new Uint8Array(xs.flatMap((x) => (typeof x === "string" ? [...x].map((c) => c.charCodeAt(0)) : [x])));

describe("sniffMime (magic bytes — never trust extension/declared type)", () => {
  it("detects allowed types", () => {
    expect(sniffMime(bytes("%PDF-1.7\n"))).toBe("application/pdf");
    expect(sniffMime(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffMime(bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(sniffMime(bytes("RIFF", 0, 0, 0, 0, "WEBPVP8 "))).toBe("image/webp");
    expect(sniffMime(bytes(0, 0, 0, 0x18, "ftypmp42"))).toBe("video/mp4");
  });
  it("rejects disguised or unknown files", () => {
    expect(sniffMime(bytes("<html><script>"))).toBeNull();
    expect(sniffMime(bytes("MZ\x90\x00"))).toBeNull(); // exe
    expect(sniffMime(bytes("PK\x03\x04"))).toBeNull(); // zip
    expect(sniffMime(bytes("%PD"))).toBeNull();
    expect(sniffMime(new Uint8Array())).toBeNull();
  });
  it("upload rules are bounded", () => {
    expect(UPLOAD_RULES.pdf.maxBytes).toBe(50 * 1024 * 1024);
    expect(UPLOAD_RULES.image.mime).not.toContain("image/svg+xml");
    expect(UPLOAD_RULES.pdf.bucket).toBe("private");
  });
});

describe("storage keys", () => {
  it("generated keys are unguessable and safe", () => {
    const k = newStorageKey("pdf", "application/pdf", "products/abc");
    expect(k).toMatch(/^products\/abc\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.pdf$/);
    expect(() => assertSafeKey(k)).not.toThrow();
    expect(newStorageKey("image", "image/png", "covers")).toMatch(/\.png$/);
  });
  it("assertSafeKey blocks traversal and odd paths", () => {
    for (const bad of ["../etc/passwd", "a/../../b.pdf", "/abs/path.pdf", "a//b.pdf", "x", "a/b\\c.pdf", "a/b c.pdf", "a/%2e%2e/b", "..", "ok/..hidden"]) {
      expect(() => assertSafeKey(bad), bad).toThrow();
    }
  });
});

describe("local upload token", () => {
  const claims = (over: Partial<LocalUploadClaims> = {}): LocalUploadClaims => ({
    b: "private",
    k: "products/p1/2026/11/abc.pdf",
    t: "application/pdf",
    m: 1000,
    u: "user-1",
    e: Date.now() + 60_000,
    ...over,
  });
  it("round-trips valid token", () => {
    const t = createLocalUploadToken(claims());
    expect(verifyLocalUploadToken(t)).toMatchObject({ k: "products/p1/2026/11/abc.pdf", u: "user-1", m: 1000 });
  });
  it("rejects expired, tampered, malformed tokens", () => {
    expect(verifyLocalUploadToken(createLocalUploadToken(claims({ e: Date.now() - 1 })))).toBeNull();
    const t = createLocalUploadToken(claims());
    const [payload, sig] = t.split(".");
    const forged = Buffer.from(JSON.stringify(claims({ m: 10 ** 12 }))).toString("base64url");
    expect(verifyLocalUploadToken(`${forged}.${sig}`)).toBeNull();
    expect(verifyLocalUploadToken(`${payload}.${sig.slice(0, -2)}xx`)).toBeNull();
    expect(verifyLocalUploadToken("garbage")).toBeNull();
    expect(verifyLocalUploadToken("")).toBeNull();
    // مفتاح غير آمن داخل رمز صحيح التوقيع
    expect(verifyLocalUploadToken(createLocalUploadToken(claims({ k: "../../etc/passwd" })))).toBeNull();
  });
  it("token signed with another secret is rejected", async () => {
    const t = createLocalUploadToken(claims());
    const { resetEnvCache } = await import("@/server/env");
    const old = process.env.APP_SECRET;
    process.env.APP_SECRET = "a-completely-different-secret-value-123456";
    resetEnvCache();
    try {
      expect(verifyLocalUploadToken(t)).toBeNull();
    } finally {
      process.env.APP_SECRET = old;
      resetEnvCache();
    }
    vi.restoreAllMocks();
  });
});

/**
 * القرار F22: الرابط الموقّع يصدر لنسخة مختومة فقط، ولدقيقة واحدة على الأكثر. أصل المذكرة أو المعاينة أو الفيديو
 * لا يُوقَّع لمتصفح أبدًا، أيًّا كان من يطلب، فالحارس في الطبقة التي تكلم التخزين لا في المسار.
 */
describe("signing a stamped copy for a buyer", () => {
  const copyKey = "stamped/3f2b1c9a-1111-4222-8333-444455556666.pdf";

  it("accepts only a stamped copy key, for at most 60 seconds", async () => {
    const { assertStampedCopyKey, STAMPED_COPY_URL_MAX_SECONDS } = await import("@/server/storage/types");
    expect(STAMPED_COPY_URL_MAX_SECONDS).toBe(60);
    expect(() => assertStampedCopyKey(copyKey, 60)).not.toThrow();
    expect(() => assertStampedCopyKey(copyKey, 1)).not.toThrow();
    for (const seconds of [0, -1, 61, 3600, Number.NaN, Number.POSITIVE_INFINITY]) expect(() => assertStampedCopyKey(copyKey, seconds), String(seconds)).toThrow();
  });

  it.each([
    "products/0b8f/2026/11/3f2b1c9a-1111-4222-8333-444455556666.pdf",
    "previews/0b8f/3f2b1c9a-1111-4222-8333-444455556666.pdf",
    "videos/3f2b1c9a-1111-4222-8333-444455556666.mp4",
    "stamped/../products/3f2b1c9a-1111-4222-8333-444455556666.pdf",
    `stamped/${"-".repeat(36)}.pdf`,
    "stamped/3F2B1C9A-1111-4222-8333-444455556666.pdf",
    "stamped/3f2b1c9a-1111-4222-8333-444455556666.pdf.mp4",
    "/stamped/3f2b1c9a-1111-4222-8333-444455556666.pdf",
    "stamped/3f2b1c9a-1111-4222-8333-444455556666.PDF",
  ])("refuses %s", async (key) => {
    const { assertStampedCopyKey } = await import("@/server/storage/types");
    expect(() => assertStampedCopyKey(key, 60)).toThrow();
  });

  it("both drivers refuse to sign anything else before touching storage", async () => {
    const { localDriver } = await import("@/server/storage/local");
    const { supabaseDriver } = await import("@/server/storage/supabase");
    for (const driver of [localDriver, supabaseDriver]) {
      await expect(driver.stampedCopyUrl("products/p1/2026/11/3f2b1c9a-1111-4222-8333-444455556666.pdf", 60, null), driver.name).rejects.toThrow();
      await expect(driver.stampedCopyUrl(copyKey, 3600, null), driver.name).rejects.toThrow();
    }
  });
});

describe("local stamped copy links (the stand-in for a Supabase signed link)", () => {
  const key = "stamped/3f2b1c9a-1111-4222-8333-444455556666.pdf";

  it("round-trip while fresh", async () => {
    const { createLocalCopyToken, verifyLocalCopyToken } = await import("@/server/storage/local");
    expect(verifyLocalCopyToken(createLocalCopyToken({ k: key, e: Date.now() + 60_000, d: null }))).toMatchObject({ k: key, d: null });
  });

  it("refuse expired, altered, foreign-key and upload tokens", async () => {
    const { createLocalCopyToken, verifyLocalCopyToken, createLocalUploadToken } = await import("@/server/storage/local");
    expect(verifyLocalCopyToken(createLocalCopyToken({ k: key, e: Date.now() - 1, d: null }))).toBeNull();
    const [payload, sig] = createLocalCopyToken({ k: key, e: Date.now() + 60_000, d: null }).split(".");
    const other = Buffer.from(JSON.stringify({ k: "stamped/00000000-1111-4222-8333-444455556666.pdf", e: Date.now() + 60_000, d: null })).toString("base64url");
    expect(verifyLocalCopyToken(`${other}.${sig}`)).toBeNull();
    expect(verifyLocalCopyToken(`${payload}.${sig.slice(0, -2)}xx`)).toBeNull();
    expect(verifyLocalCopyToken(`${payload}.${sig}.extra`)).toBeNull();
    // توقيع صحيح لمفتاح ليس نسخة مختومة: لا يفتح أصلًا
    expect(verifyLocalCopyToken(createLocalCopyToken({ k: "products/p1/2026/11/3f2b1c9a-1111-4222-8333-444455556666.pdf", e: Date.now() + 60_000, d: null }))).toBeNull();
    // رمز رفع صحيح لا يصلح رابط نسخة (مجالا توقيع منفصلان)
    expect(verifyLocalCopyToken(createLocalUploadToken({ b: "private", k: key, t: "application/pdf", m: 1000, u: "user-1", e: Date.now() + 60_000 }))).toBeNull();
  });
});
