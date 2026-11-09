import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { env, resetEnvCache } from "@/server/env";
import { register } from "@/instrumentation";
import { LessonPlayer } from "@/components/reader/lesson-player";
import { verifyBunnyWebhookSignature } from "@/server/video/bunny";
import nextConfig from "../../next.config";
import { PHASE_PRODUCTION_BUILD, PHASE_PRODUCTION_SERVER } from "next/constants";
import { TEST_ENV } from "../test-env";

const BUNNY = {
  VIDEO_PROVIDER: "bunny",
  BUNNY_STREAM_LIBRARY_ID: "424242",
  BUNNY_STREAM_API_KEY: "api-key",
  BUNNY_STREAM_TOKEN_KEY: "token-key",
  BUNNY_STREAM_READONLY_API_KEY: "readonly-key",
};

function reset() {
  for (const k of Object.keys(BUNNY)) delete process.env[k];
  for (const [k, v] of Object.entries(TEST_ENV)) process.env[k] = v;
  delete process.env.NEXT_RUNTIME;
  resetEnvCache();
}

beforeEach(reset);
afterEach(reset);

describe("the Bunny keys are checked at startup, not at play", () => {
  it.each(["BUNNY_STREAM_READONLY_API_KEY", "BUNNY_STREAM_LIBRARY_ID", "BUNNY_STREAM_API_KEY", "BUNNY_STREAM_TOKEN_KEY"] as const)("%s missing: stops with a message naming it, and no other key", (key) => {
    Object.assign(process.env, BUNNY);
    delete process.env[key];
    resetEnvCache();
    expect(() => env()).toThrow(key);
    const others = Object.keys(BUNNY).filter((k) => k !== key && k !== "VIDEO_PROVIDER");
    try {
      env();
    } catch (err) {
      for (const other of others) expect((err as Error).message).not.toContain(other);
    }
  });

  it("a key of only spaces counts as missing", () => {
    Object.assign(process.env, BUNNY, { BUNNY_STREAM_READONLY_API_KEY: "   " });
    resetEnvCache();
    expect(() => env()).toThrow("BUNNY_STREAM_READONLY_API_KEY");
  });

  it("never prints the value of a key it does have", () => {
    Object.assign(process.env, BUNNY);
    delete process.env.BUNNY_STREAM_READONLY_API_KEY;
    resetEnvCache();
    expect(() => env()).toThrow(/^(?!.*(api-key|token-key)).*$/s);
  });

  it("all keys present: starts", () => {
    Object.assign(process.env, BUNNY);
    resetEnvCache();
    expect(env().VIDEO_PROVIDER).toBe("bunny");
  });

  it("the file provider does not need them", () => {
    expect(env().VIDEO_PROVIDER).toBe("file");
  });

  it("register() stops the process with the message, and no secret in it", async () => {
    const exit = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`exit ${code}`);
    }) as never);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.NEXT_RUNTIME = "nodejs";
    Object.assign(process.env, BUNNY);
    delete process.env.BUNNY_STREAM_READONLY_API_KEY;
    resetEnvCache();
    try {
      await expect(register()).rejects.toThrow("exit 1");
      expect(exit).toHaveBeenCalledWith(1);
      const text = logged.mock.calls.flat().join(" ");
      expect(text).toContain("BUNNY_STREAM_READONLY_API_KEY");
      expect(text).not.toMatch(/api-key|token-key/);
    } finally {
      exit.mockRestore();
      logged.mockRestore();
    }
  });

  it("register() lets a correctly configured server start", async () => {
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    process.env.NEXT_RUNTIME = "nodejs";
    Object.assign(process.env, BUNNY);
    resetEnvCache();
    try {
      await expect(register()).resolves.toBeUndefined();
      expect(exit).not.toHaveBeenCalled();
    } finally {
      exit.mockRestore();
    }
  });

  it("register() does nothing on the edge runtime, which has no server env", async () => {
    process.env.NEXT_RUNTIME = "edge";
    process.env.VIDEO_PROVIDER = "bunny";
    resetEnvCache();
    await expect(register()).resolves.toBeUndefined();
  });
});

describe("a deploy without the key never goes live", () => {
  it("the production build stops and names the key", () => {
    Object.assign(process.env, BUNNY);
    delete process.env.BUNNY_STREAM_READONLY_API_KEY;
    expect(() => nextConfig(PHASE_PRODUCTION_BUILD)).toThrow("BUNNY_STREAM_READONLY_API_KEY");
  });

  it("a complete Bunny setup builds", () => {
    Object.assign(process.env, BUNNY);
    expect(nextConfig(PHASE_PRODUCTION_BUILD).poweredByHeader).toBe(false);
  });

  it("a notes-only build needs no Bunny key", () => {
    expect(process.env.VIDEO_PROVIDER).not.toBe("bunny");
    expect(() => nextConfig(PHASE_PRODUCTION_BUILD)).not.toThrow();
  });

  it("other phases leave the check to server start", () => {
    Object.assign(process.env, BUNNY);
    delete process.env.BUNNY_STREAM_READONLY_API_KEY;
    expect(() => nextConfig(PHASE_PRODUCTION_SERVER)).not.toThrow();
  });
});

describe("webhook signature", () => {
  const body = '{"VideoGuid":"x"}';
  const sign = async () => (await import("node:crypto")).createHmac("sha256", "k").update(body).digest("hex");

  it("accepts the documented version and algorithm, in any case", async () => {
    expect(verifyBunnyWebhookSignature(body, await sign(), "v1", "k", "hmac-sha256")).toBe(true);
    expect(verifyBunnyWebhookSignature(body, await sign(), "V1", "k", "HMAC-SHA256")).toBe(true);
  });

  it("rejects another algorithm even with a matching digest", async () => {
    expect(verifyBunnyWebhookSignature(body, await sign(), "v1", "k", "hmac-md5")).toBe(false);
  });
});

describe("the viewer mark on the player", () => {
  const props = { lessonId: "l", startAt: 0, trackProgress: false, watermark: "student@example.com" };
  const markup = (kind: "file" | "bunny", watermark?: string) => renderToStaticMarkup(createElement(LessonPlayer, { ...props, watermark, kind, src: "/x", embedUrl: "https://bunny.example/embed/1/2" }));
  const mark = (html: string) => /<span[^>]*data-testid="viewer-watermark"[^>]*>([^<]*)<\/span>/.exec(html);

  it.each(["file", "bunny"] as const)("the %s player shows the viewer's identity", (kind) => {
    expect(mark(markup(kind, props.watermark))?.[1]).toBe(props.watermark);
  });

  it("both players use the very same mark", () => {
    expect(mark(markup("bunny", props.watermark))?.[0]).toBe(mark(markup("file", props.watermark))?.[0]);
  });

  it.each(["file", "bunny"] as const)("the %s player shows no mark for a visitor without an account", (kind) => {
    expect(mark(markup(kind))).toBeNull();
  });

  it("the Bunny frame waits for the browser check, so its fullscreen permission is right when it loads", () => {
    vi.stubGlobal("document", undefined);
    expect(markup("bunny", props.watermark)).not.toContain("<iframe");
    vi.unstubAllGlobals();
  });
});
