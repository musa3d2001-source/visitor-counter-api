import { describe, expect, it } from "vitest";
import { EMBED_RENEW_BEFORE_MS, EMBED_RENEW_JITTER_MS, EMBED_RETRY_MAX_MS, EMBED_SWAP_BEFORE_EXPIRY_MS, renewalVerdict, renewDelayMs, resumeUrl, retryDelayMs, swapDelayMs } from "@/lib/embed-renewal";

describe("embed renewal decisions", () => {
  it("asks for a new link before the old one runs out, spread so a class does not renew in the same second", () => {
    const hour = 3600;
    expect(renewDelayMs(hour, 0)).toBe(hour * 1000 - EMBED_RENEW_BEFORE_MS);
    expect(renewDelayMs(hour, 0.999)).toBeGreaterThan(hour * 1000 - EMBED_RENEW_BEFORE_MS - EMBED_RENEW_JITTER_MS);
    expect(renewDelayMs(hour, 0.999)).toBeLessThan(hour * 1000);
  });

  it("swaps a playing video only just before expiry", () => {
    const expiresAt = 1_000_000;
    expect(swapDelayMs(expiresAt, expiresAt - 300_000)).toBe(300_000 - EMBED_SWAP_BEFORE_EXPIRY_MS);
    expect(swapDelayMs(expiresAt, expiresAt + 5_000)).toBe(0);
  });

  it("honours Retry-After, and backs off to at most a minute without it", () => {
    expect(retryDelayMs(0, 30, 0.5)).toBe(30_000);
    expect(retryDelayMs(0, 9_999, 0.5)).toBe(EMBED_RETRY_MAX_MS);
    expect(retryDelayMs(0, null, 1)).toBe(2_000);
    expect(retryDelayMs(20, null, 1)).toBe(EMBED_RETRY_MAX_MS);
    expect(retryDelayMs(20, null, 0)).toBe(EMBED_RETRY_MAX_MS / 2);
  });

  it("a refusal ends playback, a temporary failure never does", () => {
    expect(renewalVerdict(200)).toBe("renewed");
    expect(renewalVerdict(401)).toBe("session-ended");
    for (const s of [403, 404, 409]) expect(renewalVerdict(s)).toBe("access-ended");
    for (const s of [429, 500, 502, 503, 504]) expect(renewalVerdict(s)).toBe("retry");
  });

  it("adds the resume point without touching the signature", () => {
    const signed = "https://iframe.example/embed/1/abc?token=T0K&expires=99&autoplay=false";
    const u = new URL(resumeUrl(signed, 125.9, true));
    expect(u.searchParams.get("token")).toBe("T0K");
    expect(u.searchParams.get("expires")).toBe("99");
    expect(u.searchParams.get("t")).toBe("125");
    expect(u.searchParams.get("autoplay")).toBe("true");
    expect(new URL(resumeUrl(signed, 0, false)).searchParams.has("t")).toBe(false);
  });
});
