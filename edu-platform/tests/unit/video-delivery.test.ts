import { describe, expect, it } from "vitest";
import { MAX_RECOVERIES, nextRecovery, NO_RECOVERY, RECOVERY_WINDOW_MS } from "@/lib/file-playback";
import { fingerprintOf, sameVideo } from "@/server/video/fingerprint";

const base = { originalHash: "aaa", dateUploaded: "2026-11-10T10:00:00Z", length: 600, width: 1920, height: 1080 };

describe("video fingerprint", () => {
  it("a differing hash is a different video, even with the same date and dimensions", () => {
    expect(sameVideo(base, { ...base, originalHash: "bbb" })).toBe(false);
  });

  it("an equal hash is the same video, whatever else differs", () => {
    expect(sameVideo(base, { ...base, dateUploaded: "2026-12-01T00:00:00Z", length: 601.5 })).toBe(true);
  });

  it("falls back to date, dimensions and length when either side has no hash", () => {
    const noHash = { ...base, originalHash: null };
    expect(sameVideo(base, noHash)).toBe(true);
    expect(sameVideo(noHash, { ...noHash, length: 600.8 })).toBe(true);
    expect(sameVideo(noHash, { ...noHash, length: 610 })).toBe(false);
    expect(sameVideo(noHash, { ...noHash, width: 1280 })).toBe(false);
    expect(sameVideo(noHash, { ...noHash, dateUploaded: "2026-11-11T10:00:00Z" })).toBe(false);
  });

  it("treats an empty hash as no hash", () => {
    expect(fingerprintOf({ originalHash: "", dateUploaded: "", length: 1, width: 2, height: 3 })).toEqual({ originalHash: null, dateUploaded: null, length: 1, width: 2, height: 3 });
  });
});

describe("recovering a file video after its signed link expires", () => {
  const at = 1_000_000;

  it("recovers from the errors a rejected link produces, once playback had started", () => {
    expect(nextRecovery({ code: 2, loaded: true, state: NO_RECOVERY, now: at })).toEqual({ attempts: 1, windowStartedAt: at });
    expect(nextRecovery({ code: 4, loaded: true, state: NO_RECOVERY, now: at })).toEqual({ attempts: 1, windowStartedAt: at });
  });

  it("shows the error when playback never started, so a refused viewer does not loop", () => {
    expect(nextRecovery({ code: 4, loaded: false, state: NO_RECOVERY, now: at })).toBeNull();
  });

  it("does not treat a decode failure as an expired link", () => {
    expect(nextRecovery({ code: 3, loaded: true, state: NO_RECOVERY, now: at })).toBeNull();
    expect(nextRecovery({ code: 1, loaded: true, state: NO_RECOVERY, now: at })).toBeNull();
    expect(nextRecovery({ code: 0, loaded: true, state: NO_RECOVERY, now: at })).toBeNull();
  });

  it("gives up after a few attempts in a short time", () => {
    expect(nextRecovery({ code: 2, loaded: true, state: { attempts: MAX_RECOVERIES, windowStartedAt: at }, now: at + 1_000 })).toBeNull();
  });

  it("allows it again later, as the next link also expires in a long lesson", () => {
    expect(nextRecovery({ code: 2, loaded: true, state: { attempts: MAX_RECOVERIES, windowStartedAt: at }, now: at + RECOVERY_WINDOW_MS })).toEqual({ attempts: 1, windowStartedAt: at + RECOVERY_WINDOW_MS });
  });
});
