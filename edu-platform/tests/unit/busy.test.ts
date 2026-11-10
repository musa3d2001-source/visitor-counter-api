import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DB_BUSY_DIGEST, DB_BUSY_MESSAGE, DB_BUSY_TITLE } from "@/lib/busy";
import { INLINE_PAGE_CSP } from "@/lib/security-headers";
import { DatabaseBusyError, isDatabaseBusy, toBusyError } from "@/server/db-busy";

/**
 * «المنصة مشغولة»: خطأ واحد، رد 503 مع Retry-After لمسارات API، رسالة الإجراءات، وحالة الصفحات.
 */
const reported = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock("@/server/platform/report-error", () => ({ reportError: async (...args: unknown[]) => void reported.calls.push(args) }));
const actor = vi.hoisted(() => ({ fail: null as unknown }));
vi.mock("@/server/auth/guards", () => ({
  assertAdmin: async () => {
    if (actor.fail) throw actor.fail;
    return { id: "owner-1" };
  },
}));
vi.mock("@/server/http", () => ({ clientIp: async () => "192.0.2.1" }));

const { busyResponse, withBusyGuard } = await import("@/server/busy-response");
const { adminAction } = await import("@/server/admin/common");

beforeEach(() => {
  reported.calls.length = 0;
  actor.fail = null;
});

describe("the one busy error", () => {
  it.each([
    ["QUEUE_TIMEOUT", "queue"],
    ["57014", "statement"],
    ["25P03", "idle_in_transaction"],
    ["CONNECT_TIMEOUT", "connect"],
    ["53300", "unavailable"],
  ])("code %s becomes DatabaseBusyError(%s) with a fixed message and digest", (code, reason) => {
    const original = Object.assign(new Error("select secret from somewhere where x = 'value'"), { code });
    const err = toBusyError(original) as DatabaseBusyError;
    expect(err).toBeInstanceOf(DatabaseBusyError);
    expect(err.reason).toBe(reason);
    expect(err.digest).toBe(DB_BUSY_DIGEST);
    expect(err.message).toBe(`database busy: ${reason}`);
    expect(err.cause).toBe(original);
  });

  it("leaves other errors alone", () => {
    const unique = Object.assign(new Error("dup"), { code: "23505" });
    expect(toBusyError(unique)).toBe(unique);
    expect(isDatabaseBusy(unique)).toBe(false);
    expect(isDatabaseBusy({ digest: DB_BUSY_DIGEST })).toBe(true);
  });
});

describe("API routes", () => {
  it("answer 503 with Retry-After and no detail", async () => {
    const res = busyResponse();
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("5");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ error: DB_BUSY_MESSAGE, busy: true });
  });

  it("the browser-facing variant is a small page that retries by itself, under its own CSP", async () => {
    const res = busyResponse("html");
    expect(res.status).toBe(503);
    expect(res.headers.get("content-security-policy")).toBe(INLINE_PAGE_CSP);
    const html = await res.text();
    expect(html).toContain(DB_BUSY_TITLE);
    expect(html).toContain('http-equiv="refresh"');
    expect(html).not.toContain("<script");
  });

  it("withBusyGuard turns busy into 503 and reports it, and passes anything else through", async () => {
    const busy = withBusyGuard(async () => {
      throw new DatabaseBusyError("queue");
    });
    const res = await busy();
    expect(res.status).toBe(503);
    expect(reported.calls.map((c) => c[0])).toEqual(["db:busy"]);

    const ok = withBusyGuard(async () => new Response("fine"));
    expect(await (await ok()).text()).toBe("fine");

    const other = withBusyGuard(async () => {
      throw new Error("real bug");
    });
    await expect(other()).rejects.toThrow("real bug");
  });

  it("every exported handler of every route.ts is wrapped", () => {
    const root = join(process.cwd(), "src", "app");
    const routes: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (name === "route.ts") routes.push(p);
      }
    };
    walk(root);
    expect(routes.length).toBeGreaterThan(10);
    const problems: string[] = [];
    for (const file of routes) {
      const src = readFileSync(file, "utf8");
      const where = relative(root, file);
      if (/export\s+(async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/.test(src)) problems.push(`${where}: unwrapped function export`);
      const methods = [...src.matchAll(/export\s+const\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*=\s*([^;\n]*)/g)];
      if (!methods.length) problems.push(`${where}: no handler found`);
      for (const m of methods) if (!m[2].startsWith("withBusyGuard(")) problems.push(`${where}: ${m[1]} not wrapped`);
    }
    expect(problems).toEqual([]);
  });
});

describe("admin actions", () => {
  it("say the platform is busy instead of logging an error", async () => {
    const res = await adminAction(async () => {
      throw new DatabaseBusyError("statement");
    });
    expect(res).toEqual({ error: DB_BUSY_MESSAGE });
    expect(reported.calls).toEqual([]);
  });

  it("a busy database while checking the session is busy, not 'not allowed'", async () => {
    actor.fail = new DatabaseBusyError("queue");
    expect(await adminAction(async () => {})).toEqual({ error: DB_BUSY_MESSAGE });
  });
});

describe("pages", () => {
  const busyError = Object.assign(new Error("Server Components render error"), { digest: DB_BUSY_DIGEST });
  const otherError = Object.assign(new Error("x"), { digest: "123456" });

  it("the site and admin error pages show the busy state without an error code", async () => {
    for (const path of ["@/app/(site)/error", "@/app/admin/error"]) {
      const { default: ErrorPage } = await import(/* @vite-ignore */ path);
      const busy = renderToStaticMarkup(createElement(ErrorPage, { error: busyError, reset: () => {} }));
      expect(busy, path).toContain(DB_BUSY_TITLE);
      expect(busy, path).toContain('data-testid="busy-title"');
      expect(busy, path).not.toContain(DB_BUSY_DIGEST);
      const other = renderToStaticMarkup(createElement(ErrorPage, { error: otherError, reset: () => {} }));
      expect(other, path).not.toContain(DB_BUSY_TITLE);
      expect(other, path).toContain("123456");
    }
  });
});
