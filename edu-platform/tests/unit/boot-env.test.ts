import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { register } from "@/instrumentation";
import { env, opsAlertEmail, resetEnvCache } from "@/server/env";
import { TEST_ENV } from "../test-env";

/**
 * نشر Production و Preview الحاليان فيهما هذه الأسماء بالضبط، لا أقل ولا أكثر (الدفع معطل، البريد سجل، الفيديو ملف).
 * أي متغير إلزامي جديد خارجها يسقط هذا الاختبار: يجب أن يوقف وظيفته فقط ويظهر للمالك، لا أن يوقف الموقع.
 */
const DEPLOYED: Record<string, string> = {
  TRUST_PROXY: "true",
  VIDEO_PROVIDER: "file",
  MAIL_DRIVER: "log",
  PAYMENTS_MODE: "disabled",
  SUPABASE_PUBLIC_BUCKET: "public-media",
  SUPABASE_PRIVATE_BUCKET: "private-content",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-value-do-not-print",
  SUPABASE_URL: "https://example-project.supabase.co",
  STORAGE_DRIVER: "supabase",
  DATABASE_POOL_MAX: "3",
  DATABASE_PGBOUNCER: "true",
  DATABASE_URL: "postgres://user-name:db-password-do-not-print@pooler.example.com:6543/postgres",
  APP_SECRET: "app-secret-do-not-print-0123456789abcdef",
  APP_URL: "https://preview-example.vercel.app",
};

const ENV_NAMES = [...new Set([...Object.keys(TEST_ENV), ...Object.keys(DEPLOYED), "CRON_SECRET", "OPS_ALERT_EMAIL", "NEXT_RUNTIME", "NEXT_PHASE", "VERCEL_ENV"])];
const saved = new Map<string, string | undefined>();

function useEnv(values: Record<string, string>) {
  for (const name of ENV_NAMES) delete process.env[name];
  Object.assign(process.env, values);
  resetEnvCache();
}

const useDeployedEnv = (patch: Record<string, string> = {}) => useEnv({ ...DEPLOYED, NODE_ENV: "production", NEXT_RUNTIME: "nodejs", ...patch });

function trapExit() {
  const exit = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new Error(`exit ${code}`);
  }) as never);
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  return { exit, logged, text: () => logged.mock.calls.flat().join(" ") };
}

beforeEach(() => {
  for (const name of ENV_NAMES) saved.set(name, process.env[name]);
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  resetEnvCache();
});

describe("the environment that is deployed today", () => {
  it("is exactly these fourteen names", () => {
    expect(Object.keys(DEPLOYED).sort()).toEqual(
      [
        "APP_SECRET",
        "APP_URL",
        "DATABASE_PGBOUNCER",
        "DATABASE_POOL_MAX",
        "DATABASE_URL",
        "MAIL_DRIVER",
        "PAYMENTS_MODE",
        "STORAGE_DRIVER",
        "SUPABASE_PRIVATE_BUCKET",
        "SUPABASE_PUBLIC_BUCKET",
        "SUPABASE_SERVICE_ROLE_KEY",
        "SUPABASE_URL",
        "TRUST_PROXY",
        "VIDEO_PROVIDER",
      ].sort(),
    );
  });

  it("parses and lets the server start, with no CRON_SECRET and no OPS_ALERT_EMAIL", async () => {
    useDeployedEnv();
    const { exit } = trapExit();
    expect(() => env()).not.toThrow();
    expect(env().CRON_SECRET).toBeUndefined();
    await expect(register()).resolves.toBeUndefined();
    expect(exit).not.toHaveBeenCalled();
  });

  it("a missing or nonsense alert address is a warning, never a crash", async () => {
    for (const value of ["", "not-an-email", "owner@example.com"]) {
      useDeployedEnv({ OPS_ALERT_EMAIL: value });
      const { exit } = trapExit();
      await expect(register()).resolves.toBeUndefined();
      expect(exit).not.toHaveBeenCalled();
      expect(opsAlertEmail()).toBeNull();
    }
  });

  it("a real alert address is used as it is", () => {
    useDeployedEnv({ OPS_ALERT_EMAIL: " owner@darb.school " });
    expect(opsAlertEmail()).toBe("owner@darb.school");
  });
});

describe("a broken configuration stops the server at start", () => {
  it("names the missing variable", async () => {
    const { DATABASE_URL: _gone, ...rest } = DEPLOYED;
    useEnv({ ...rest, NODE_ENV: "production", NEXT_RUNTIME: "nodejs" });
    const trap = trapExit();
    await expect(register()).rejects.toThrow("exit 1");
    expect(trap.text()).toContain("DATABASE_URL");
  });

  it("names a wrong variable and never prints the value it was given", async () => {
    useDeployedEnv({ APP_SECRET: "tooshortvalue", DATABASE_URL: "secret-looking-not-a-url" });
    const trap = trapExit();
    await expect(register()).rejects.toThrow("exit 1");
    const text = trap.text();
    expect(text).toContain("APP_SECRET");
    expect(text).not.toContain("tooshortvalue");
    expect(text).not.toContain("secret-looking-not-a-url");
  });

  it("does not print an unrelated secret either", async () => {
    useDeployedEnv({ PAYMENTS_MODE: "nonsense-mode" });
    const trap = trapExit();
    await expect(register()).rejects.toThrow("exit 1");
    const text = trap.text();
    expect(text).toContain("PAYMENTS_MODE");
    expect(text).not.toMatch(/do-not-print|nonsense-mode/);
  });

  it("refuses a production server with no APP_URL, because links would go to localhost", async () => {
    const { APP_URL: _gone, ...rest } = DEPLOYED;
    useEnv({ ...rest, NODE_ENV: "production", NEXT_RUNTIME: "nodejs" });
    const trap = trapExit();
    await expect(register()).rejects.toThrow("exit 1");
    expect(trap.text()).toContain("APP_URL");
  });

  it("the check runs at start, before any request asks for env()", async () => {
    useDeployedEnv({ APP_SECRET: "tooshortvalue" });
    const trap = trapExit();
    await expect(register()).rejects.toThrow("exit 1");
    expect(trap.exit).toHaveBeenCalledTimes(1);
  });
});

describe("the build phase does not run the server check", () => {
  it("a build with an incomplete environment is not stopped", async () => {
    useEnv({ NODE_ENV: "production", NEXT_RUNTIME: "nodejs", NEXT_PHASE: PHASE_PRODUCTION_BUILD });
    const { exit } = trapExit();
    await expect(register()).resolves.toBeUndefined();
    expect(exit).not.toHaveBeenCalled();
  });

  it("the edge runtime has nothing to check", async () => {
    useEnv({ NODE_ENV: "production", NEXT_RUNTIME: "edge" });
    const { exit } = trapExit();
    await expect(register()).resolves.toBeUndefined();
    expect(exit).not.toHaveBeenCalled();
  });
});
