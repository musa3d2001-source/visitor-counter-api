import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { register } from "@/instrumentation";
import { configWarnings, ENV_KEYS, env, opsAlertEmail, resetEnvCache } from "@/server/env";
import nextConfig from "../../next.config";
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

const ENV_NAMES = [...new Set([...ENV_KEYS, ...Object.keys(TEST_ENV), ...Object.keys(DEPLOYED), "CRON_SECRET", "OPS_ALERT_EMAIL", "NEXT_RUNTIME", "NEXT_PHASE", "VERCEL_ENV", "SITE_INDEXABLE", "MYFATOORAH_LIVE_CONFIRMED"])];
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

describe("a value typed from a phone, as the launch page asks", () => {
  it.each([
    ["SITE_INDEXABLE", "True", "SITE_INDEXABLE", true],
    ["SITE_INDEXABLE", "true ", "SITE_INDEXABLE", true],
    ["SITE_INDEXABLE", " FALSE", "SITE_INDEXABLE", false],
    ["TRUST_PROXY", "True", "TRUST_PROXY", true],
    ["PAYMENTS_MODE", "Disabled ", "PAYMENTS_MODE", "disabled"],
    ["MAIL_DRIVER", " Log", "MAIL_DRIVER", "log"],
    ["MYFATOORAH_LIVE_CONFIRMED", "TRUE", "MYFATOORAH_LIVE_CONFIRMED", true],
    ["VIDEO_PROVIDER", "File", "VIDEO_PROVIDER", "file"],
    ["DATABASE_PGBOUNCER", "True\n", "DATABASE_PGBOUNCER", true],
  ] as const)("%s=%j starts the server and reads as meant", async (name, value, key, expected) => {
    useDeployedEnv({ [name]: value });
    const { exit } = trapExit();
    await expect(register()).resolves.toBeUndefined();
    expect(exit).not.toHaveBeenCalled();
    expect(env()[key]).toBe(expected);
  });

  it("a SITE_INDEXABLE it cannot read hides the site from search instead of stopping it", async () => {
    useDeployedEnv({ SITE_INDEXABLE: "yes please" });
    const { exit } = trapExit();
    await expect(register()).resolves.toBeUndefined();
    expect(exit).not.toHaveBeenCalled();
    expect(env().SITE_INDEXABLE).toBe(false);
  });

  it("an empty word means unset, so the default applies", () => {
    useDeployedEnv({ PAYMENTS_MODE: "  ", TRUST_PROXY: "" });
    expect(env()).toMatchObject({ PAYMENTS_MODE: "disabled", TRUST_PROXY: true });
  });
});

describe("a Vercel build checks what the server would check at start", () => {
  const build = () => nextConfig(PHASE_PRODUCTION_BUILD);

  it("fails on a value the server would refuse, naming it and never printing a value", () => {
    useDeployedEnv({ VERCEL_ENV: "production", PAYMENTS_MODE: "nonsense-mode" });
    expect(build).toThrow("PAYMENTS_MODE");
    expect(build).toThrow(/^(?!.*(nonsense-mode|do-not-print)).*$/s);
  });

  it("fails on a production build with no APP_URL", () => {
    const { APP_URL: _gone, ...rest } = DEPLOYED;
    useEnv({ ...rest, NODE_ENV: "production", VERCEL_ENV: "production" });
    expect(build).toThrow("APP_URL");
  });

  it("passes the deployed environment, and the same one typed with capitals and spaces", () => {
    useDeployedEnv({ VERCEL_ENV: "preview" });
    expect(build()).toBeTruthy();
    useDeployedEnv({ VERCEL_ENV: "production", TRUST_PROXY: "True ", PAYMENTS_MODE: " Disabled", SITE_INDEXABLE: "TRUE" });
    expect(build()).toBeTruthy();
  });

  it("a local build without the runtime variables is not stopped", () => {
    useEnv({ NODE_ENV: "production" });
    expect(build()).toBeTruthy();
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

describe("a real deployment does not run on development defaults", () => {
  it("the deployed set boots on Vercel Production and Preview", async () => {
    for (const vercelEnv of ["production", "preview"]) {
      useDeployedEnv({ VERCEL_ENV: vercelEnv });
      const { exit } = trapExit();
      await expect(register()).resolves.toBeUndefined();
      expect(exit).not.toHaveBeenCalled();
    }
  });

  it.each([
    ["http://localhost:3000", "APP_URL"],
    ["https://localhost", "APP_URL"],
    ["http://127.0.0.1:3000", "APP_URL"],
    ["http://www.example-school.com", "APP_URL"],
  ])("refuses APP_URL=%s on Vercel, because reset and payment links would point there", async (url, name) => {
    useDeployedEnv({ VERCEL_ENV: "production", APP_URL: url });
    const trap = trapExit();
    await expect(register()).rejects.toThrow("exit 1");
    expect(trap.text()).toContain(name);
    expect(() => nextConfig(PHASE_PRODUCTION_BUILD)).toThrow(name);
  });

  it("refuses local file storage on Vercel, where the disk is wiped", async () => {
    useDeployedEnv({ VERCEL_ENV: "preview", STORAGE_DRIVER: "local" });
    const trap = trapExit();
    await expect(register()).rejects.toThrow("exit 1");
    expect(trap.text()).toContain("STORAGE_DRIVER");
  });

  it("still boots off Vercel on localhost (local runs, E2E, the load harness)", async () => {
    useDeployedEnv({ APP_URL: "http://localhost:3310", STORAGE_DRIVER: "local" });
    const { exit } = trapExit();
    await expect(register()).resolves.toBeUndefined();
    expect(exit).not.toHaveBeenCalled();
  });
});

describe("an empty value copied from .env.example means unset", () => {
  it("empty addresses and words fall back to their defaults instead of stopping the server", async () => {
    useDeployedEnv({ MYFATOORAH_BASE_URL: "", BUNNY_STREAM_EMBED_BASE: " ", SMTP_PORT: "", DATABASE_POOL_MAX: "" });
    const { exit } = trapExit();
    await expect(register()).resolves.toBeUndefined();
    expect(exit).not.toHaveBeenCalled();
    expect(env().DATABASE_POOL_MAX).toBe(5);
  });
});

describe("the public data cache lifetime", () => {
  it("defaults to 55 seconds, inside the one-minute promise, with nothing for the owner to set", () => {
    useDeployedEnv();
    expect(env().PUBLIC_CACHE_SECONDS).toBe(55);
    expect(configWarnings()).toEqual([]);
  });

  it("can be shortened, or turned off with 0", () => {
    useDeployedEnv({ PUBLIC_CACHE_SECONDS: "20" });
    expect(env().PUBLIC_CACHE_SECONDS).toBe(20);
    useDeployedEnv({ PUBLIC_CACHE_SECONDS: "0" });
    expect(env().PUBLIC_CACHE_SECONDS).toBe(0);
    expect(configWarnings()).toEqual([]);
  });

  it("a value that would break the one-minute promise keeps the default and is named for the owner, never a crash", async () => {
    useDeployedEnv({ PUBLIC_CACHE_SECONDS: "3600" });
    const { exit } = trapExit();
    await expect(register()).resolves.toBeUndefined();
    expect(exit).not.toHaveBeenCalled();
    expect(env().PUBLIC_CACHE_SECONDS).toBe(55);
    expect(configWarnings()).toEqual(["PUBLIC_CACHE_SECONDS"]);
  });
});

describe("the database fail-fast limits", () => {
  it("default to 60 s idle, 10 s per statement and 8 s pool wait", () => {
    useDeployedEnv();
    expect(env()).toMatchObject({ DATABASE_IDLE_TIMEOUT_SECONDS: 60, DATABASE_STATEMENT_TIMEOUT_MS: 10_000, DATABASE_QUEUE_TIMEOUT_MS: 8_000 });
    expect(configWarnings()).toEqual([]);
  });

  it("read a valid value", () => {
    useDeployedEnv({ DATABASE_IDLE_TIMEOUT_SECONDS: "30", DATABASE_STATEMENT_TIMEOUT_MS: " 15000 ", DATABASE_QUEUE_TIMEOUT_MS: "4000" });
    expect(env()).toMatchObject({ DATABASE_IDLE_TIMEOUT_SECONDS: 30, DATABASE_STATEMENT_TIMEOUT_MS: 15_000, DATABASE_QUEUE_TIMEOUT_MS: 4_000 });
    expect(configWarnings()).toEqual([]);
  });

  it("an unreadable or out-of-range value keeps the default and is named for the owner, never a crash", async () => {
    useDeployedEnv({ DATABASE_STATEMENT_TIMEOUT_MS: "ten seconds", DATABASE_QUEUE_TIMEOUT_MS: "5", DATABASE_IDLE_TIMEOUT_SECONDS: "99999999" });
    const { exit } = trapExit();
    await expect(register()).resolves.toBeUndefined();
    expect(exit).not.toHaveBeenCalled();
    expect(env()).toMatchObject({ DATABASE_IDLE_TIMEOUT_SECONDS: 60, DATABASE_STATEMENT_TIMEOUT_MS: 10_000, DATABASE_QUEUE_TIMEOUT_MS: 8_000 });
    const warnings = configWarnings();
    expect([...warnings].sort()).toEqual(["DATABASE_IDLE_TIMEOUT_SECONDS", "DATABASE_QUEUE_TIMEOUT_MS", "DATABASE_STATEMENT_TIMEOUT_MS"]);
    expect(warnings.join(" ")).not.toMatch(/ten seconds|99999999/);
  });
});
