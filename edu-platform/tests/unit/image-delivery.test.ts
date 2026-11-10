import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ sign: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ storage: { from: () => ({ createSignedUploadUrl: mocks.sign }) } }) }));

const { default: nextConfig } = await import("../../next.config");
const { supabaseDriver } = await import("@/server/storage/supabase");
const { newStorageKey } = await import("@/server/storage");

const images = nextConfig(PHASE_DEVELOPMENT_SERVER).images!;
const widths = [...images.imageSizes!, ...images.deviceSizes!].sort((a, b) => a - b);

/** أصغر عرض متاح يكفي مساحة الصورة، كما يختار المتصفح من srcset */
const pick = (slot: number) => widths.find((w) => w >= slot) ?? widths[widths.length - 1];

describe("cover image delivery", () => {
  it("transforms to one format and keeps the result for a month", () => {
    expect(images.formats).toEqual(["image/webp"]);
    expect(images.minimumCacheTTL).toBeGreaterThanOrEqual(31 * 24 * 3600);
  });

  it("keeps the number of widths small, since each one is a possible transformation of each cover", () => {
    expect(widths.length).toBeLessThanOrEqual(8);
    expect(Math.max(...images.imageSizes!)).toBeLessThan(Math.min(...images.deviceSizes!));
  });

  // المساحات المعلنة في sizes عبر الصفحات، وعرض الجوال 390 لنِسَب vw
  const slots = [52, 64, 72, 76, 80, 96, 128, 160, 184, 300, 380, 420, 480, 390 * 0.85, 390 * 0.9, 390 * 0.92];
  it.each(slots.flatMap((slot) => [1, 2, 3].map((dpr) => [slot, dpr] as const)))("serves a width that fits a %d px slot at density %d", (slot, dpr) => {
    const need = Math.ceil(slot * dpr);
    const got = pick(need);
    // يكفي المساحة (إلا إن كانت أكبر من أكبر عرض) ولا يتجاوزها بأكثر من الضعف
    expect(got).toBeGreaterThanOrEqual(Math.min(need, widths[widths.length - 1]));
    expect(got / need).toBeLessThanOrEqual(2);
  });

  it("declares a sizes value on every image that fills its box", () => {
    const files = ["src/components/site/product-cover.tsx", "src/components/site/video-card.tsx", "src/components/site/exam-ticket.tsx", "src/components/site/teacher-avatar.tsx", "src/app/(site)/products/[slug]/_components/hero-art.tsx"];
    for (const f of files) {
      const src = readFileSync(join(__dirname, "../..", f), "utf8");
      for (const m of src.matchAll(/<Image\b[^>]*>/g)) expect(m[0], f).toMatch(/\bsizes=/);
    }
  });

  it("gives a public upload a year of caching and keeps private files short", async () => {
    mocks.sign.mockResolvedValue({ data: { signedUrl: "https://x.supabase.co/sign" }, error: null });
    const pub = await supabaseDriver.createUploadTarget("public", "covers/a/b.webp", "image/webp", 100, "u");
    expect(pub.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
    expect(pub.headers["x-upsert"]).toBe("false");
    const priv = await supabaseDriver.createUploadTarget("private", "products/a/b.pdf", "application/pdf", 100, "u");
    expect(priv.headers["cache-control"]).toBe("max-age=3600");
  });

  it("gives every upload a new key, so a replaced cover has a new URL", () => {
    const a = newStorageKey("image", "image/png", "products/p1");
    const b = newStorageKey("image", "image/png", "products/p1");
    expect(a).not.toBe(b);
    expect(a.startsWith("products/p1")).toBe(true);
  });
});
