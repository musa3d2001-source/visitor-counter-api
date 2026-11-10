import { afterEach, describe, expect, it } from "vitest";
import { ipFromHeaders } from "@/server/http";
import { resetEnvCache } from "@/server/env";

/**
 * عنوان الزائر الذي تعتمد عليه حدود المحاولات: لا يستطيع الزائر اختياره بترويسة يكتبها بنفسه.
 */
const NAMES = ["TRUST_PROXY", "VERCEL_ENV", "APP_URL", "STORAGE_DRIVER", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const saved = Object.fromEntries(NAMES.map((k) => [k, process.env[k]]));

function setEnv(values: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  resetEnvCache();
}

const onVercel = () =>
  setEnv({ TRUST_PROXY: "true", VERCEL_ENV: "production", APP_URL: "https://www.example-school.com", STORAGE_DRIVER: "supabase", SUPABASE_URL: "https://p.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k" });
const offVercel = () => setEnv({ TRUST_PROXY: "true", VERCEL_ENV: undefined });

afterEach(() => setEnv(saved));

const h = (o: Record<string, string>) => new Headers(o);

describe("client address", () => {
  it("off Vercel: uses the last X-Forwarded-For entry (added by the proxy in front), never the forgeable first", () => {
    offVercel();
    expect(ipFromHeaders(h({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" }))).toBe("203.0.113.9");
    expect(ipFromHeaders(h({ "x-forwarded-for": "6.6.6.6,203.0.113.9 , " }))).toBe("203.0.113.9");
    // أداة اختبار الضغط ترسل قيمة واحدة
    expect(ipFromHeaders(h({ "x-forwarded-for": "10.1.2.3" }))).toBe("10.1.2.3");
    expect(ipFromHeaders(h({ "x-real-ip": "198.51.100.4" }))).toBe("198.51.100.4");
  });

  it("off Vercel: ignores x-vercel-forwarded-for, which anyone can send there", () => {
    offVercel();
    expect(ipFromHeaders(h({ "x-vercel-forwarded-for": "6.6.6.6", "x-forwarded-for": "203.0.113.9" }))).toBe("203.0.113.9");
    expect(ipFromHeaders(h({ "x-vercel-forwarded-for": "6.6.6.6" }))).toBe("unknown");
  });

  it("on Vercel: prefers the address Vercel vouches for", () => {
    onVercel();
    expect(ipFromHeaders(h({ "x-vercel-forwarded-for": "203.0.113.9", "x-real-ip": "198.51.100.1", "x-forwarded-for": "6.6.6.6" }))).toBe("203.0.113.9");
    expect(ipFromHeaders(h({ "x-real-ip": "198.51.100.1", "x-forwarded-for": "6.6.6.6" }))).toBe("198.51.100.1");
    expect(ipFromHeaders(h({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("trusts no header when TRUST_PROXY is off", () => {
    setEnv({ TRUST_PROXY: "false", VERCEL_ENV: undefined });
    expect(ipFromHeaders(h({ "x-forwarded-for": "203.0.113.9", "x-real-ip": "203.0.113.9" }))).toBe("unknown");
  });

  it("caps the length and treats empty values as missing", () => {
    offVercel();
    expect(ipFromHeaders(h({ "x-forwarded-for": `1.1.1.1, ${"a".repeat(200)}` })).length).toBe(64);
    expect(ipFromHeaders(h({ "x-forwarded-for": " , ", "x-real-ip": "198.51.100.4" }))).toBe("198.51.100.4");
    expect(ipFromHeaders(h({}))).toBe("unknown");
  });
});
