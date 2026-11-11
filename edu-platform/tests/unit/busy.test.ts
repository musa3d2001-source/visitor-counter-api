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

/** كل رمز يعده db-busy.ts انشغالًا، بالسبب الذي يُعد به في «صحة المنصة». رمز يُضاف هناك بلا سطر هنا يُسقط الاختبار التالي */
const BUSY_BY_CODE: [string, string][] = [
  ["QUEUE_TIMEOUT", "queue"],
  ["57014", "statement"],
  ["25P03", "idle_in_transaction"],
  ["CONNECT_TIMEOUT", "connect"],
  ["53300", "unavailable"],
  ["57P03", "unavailable"],
  ["57P01", "unavailable"],
  ["57P02", "unavailable"],
  ["ECONNREFUSED", "unavailable"],
  ["ECONNRESET", "unavailable"],
  ["ETIMEDOUT", "unavailable"],
  ["EPIPE", "unavailable"],
  ["EAI_AGAIN", "unavailable"],
  ["CONNECTION_CLOSED", "unavailable"],
];

/**
 * رفض الـ pooler: الرمز عام، والسبب في النص. النصوص كما يبنيها Supavisor (lib/supavisor/error.ex) و PgBouncer (src/client.c و src/janitor.c)
 */
const BUSY_BY_MESSAGE: [string, string, string][] = [
  ["XX000", "(EMAXCONN) max client connections reached, limit: 400", "unavailable"],
  ["XX000", "(EMAXCONNSESSION) max clients reached in session mode - max clients are limited to pool_size: 15", "unavailable"],
  ["XX000", "(EMAXPOOLSREACHED) max pools count reached", "unavailable"],
  ["XX000", "(ECHECKOUTTIMEOUT) unable to check out connection from the pool after 15000ms in Transaction mode", "queue"],
  ["XX000", "(ECHECKOUTRETRIES) failed to check out a connection after multiple retries", "queue"],
  ["XX000", "(EDBHANDLEREXITED) DbHandler exited, reason: :shutdown", "unavailable"],
  ["XX000", "(ECIRCUITBREAKER) too many failed attempts to connect to the database, new connections are temporarily blocked", "unavailable"],
  ["XX000", "Max client connections reached", "unavailable"],
  ["08P01", "no more connections allowed (max_client_conn)", "unavailable"],
  ["08P01", "client connections exceeded (max_db_client_connections)", "unavailable"],
  ["08P01", "client connections exceeded (max_user_client_connections)", "unavailable"],
  ["08P01", "query_wait_timeout", "queue"],
];

/** أخطاء تبقى عطلًا يراه المالك: إعداد خاطئ لا يُصلحه الانتظار */
const NOT_BUSY: [string, string][] = [
  ["XX000", "(ETENANTNOTFOUND) Tenant or user not found"],
  ["XX000", "(ECIRCUITBREAKER) too many authentication errors, new connections are temporarily blocked"],
  ["XX000", "(EPOOLCHECKOUT) pool checkout failed: :badarg"],
  ["XX000", "internal error"],
  ["08P01", "server login has been failing, cached error: password authentication failed (server_login_retry)"],
  ["08P01", "invalid packet"],
  ["28P01", "password authentication failed for user \"postgres\""],
  ["ENOTFOUND", "getaddrinfo ENOTFOUND db.wrong-project.supabase.co"],
  ["23505", "max client connections reached"],
];

describe("the one busy error", () => {
  it.each(BUSY_BY_CODE)("code %s becomes DatabaseBusyError(%s) with a fixed message and digest", (code, reason) => {
    const original = Object.assign(new Error("select secret from somewhere where x = 'value'"), { code });
    const err = toBusyError(original) as DatabaseBusyError;
    expect(err).toBeInstanceOf(DatabaseBusyError);
    expect(err.reason).toBe(reason);
    expect(err.digest).toBe(DB_BUSY_DIGEST);
    expect(err.message).toBe(`database busy: ${reason}`);
    expect(err.cause).toBe(original);
  });

  it.each(BUSY_BY_MESSAGE)("pooler refusal %s %s becomes DatabaseBusyError(%s), the pooler's text left behind", (code, text, reason) => {
    const original = Object.assign(new Error(text), { code, severity_local: "FATAL" });
    const err = toBusyError(original) as DatabaseBusyError;
    expect(err).toBeInstanceOf(DatabaseBusyError);
    expect(err.reason).toBe(reason);
    expect(err.message).toBe(`database busy: ${reason}`);
    expect(err.message).not.toContain(text);
  });

  it.each(NOT_BUSY)("%s %s stays the error it is", (code, text) => {
    const original = Object.assign(new Error(text), { code });
    expect(toBusyError(original)).toBe(original);
    expect(isDatabaseBusy(original)).toBe(false);
  });

  it("every code db-busy.ts maps is in the table above", () => {
    const source = readFileSync(join(process.cwd(), "src", "server", "db-busy.ts"), "utf8");
    const block = /const BUSY_CODES[^{]*\{([\s\S]*?)\n\};/.exec(source)![1];
    const mapped = [...block.matchAll(/^\s*"?([A-Z0-9_]+)"?:\s*"/gm)].map((m) => m[1]);
    expect(mapped.length).toBeGreaterThan(10);
    expect([...mapped].sort()).toEqual(BUSY_BY_CODE.map(([code]) => code).sort());
    const tags = [.../const SUPAVISOR_BUSY[^{]*\{([\s\S]*?)\n\};/.exec(source)![1].matchAll(/^\s*([A-Z_]+):\s*"/gm)].map((m) => m[1]);
    expect(tags.length).toBeGreaterThan(4);
    for (const tag of tags) expect(BUSY_BY_MESSAGE.some(([, text]) => text.startsWith(`(${tag})`)), tag).toBe(true);
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
    for (const path of ["@/app/(site)/error", "@/app/admin/error", "@/app/global-error"]) {
      const { default: ErrorPage } = await import(/* @vite-ignore */ path);
      const busy = renderToStaticMarkup(createElement(ErrorPage, { error: busyError, reset: () => {} }));
      expect(busy, path).toContain(DB_BUSY_TITLE);
      expect(busy, path).toContain('data-testid="busy-title"');
      expect(busy, path).not.toContain(DB_BUSY_DIGEST);
      const other = renderToStaticMarkup(createElement(ErrorPage, { error: otherError, reset: () => {} }));
      expect(other, path).not.toContain(DB_BUSY_TITLE);
      // صفحة الخطأ العامة لا تعرض رمزًا أصلًا؛ صفحتا الموقع والإدارة تعرضانه لغير الانشغال
      if (path !== "@/app/global-error") expect(other, path).toContain("123456");
    }
  });
});
