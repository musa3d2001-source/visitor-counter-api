import { test, expect, request as playwrightRequest } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import { E2E_SERVER_ENV } from "./e2e-env";
import { expectNoHorizontalOverflow } from "./helpers";

/**
 * على الخادم الإنتاجي الفعلي: رؤوس الأمان كما يرسلها Next فعلًا، وحالة «المنصة مشغولة» عندما لا تجيب قاعدة البيانات.
 */
const OS_ONLY = ["PATH", "Path", "SystemRoot", "windir", "TEMP", "TMP", "HOME", "USERPROFILE", "ComSpec", "PATHEXT", "SystemDrive"];
const STRICT = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

test.describe("security headers", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "تكفي مرة واحدة على الكمبيوتر"));

  test("API responses carry a strict CSP and the usual headers", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.headers()["content-security-policy"]).toBe(STRICT);
    expect(res.headers()["x-frame-options"]).toBe("DENY");
    expect(res.headers()["x-content-type-options"]).toBe("nosniff");
  });

  test("a path that only starts with api is an ordinary page with the nonce CSP", async ({ request }) => {
    const res = await request.get("/apixyz");
    expect(res.status()).toBe(404);
    expect(res.headers()["content-security-policy"]).toContain("'nonce-");
  });

  test("the login redirect carries the security headers", async ({ request }) => {
    const res = await request.get("/admin/orders", { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.headers()["location"]).toContain("/login?next=");
    expect(res.headers()["content-security-policy"]).toBe(STRICT);
    expect(res.headers()["x-frame-options"]).toBe("DENY");
    expect(res.headers()["strict-transport-security"]).toContain("max-age=");
  });
});

test.describe("a database that does not answer", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "تكفي مرة واحدة على الكمبيوتر"));
  test.describe.configure({ mode: "serial" });

  const PORT = 3197;
  const BASE = `http://127.0.0.1:${PORT}`;
  let server: ChildProcess;

  test.beforeAll(async ({}, info) => {
    if (info.project.name !== "desktop") return;
    test.setTimeout(90_000);
    const osEnv = Object.fromEntries(OS_ONLY.flatMap((name) => (process.env[name] ? [[name, process.env[name]!]] : [])));
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)], {
      cwd: resolve(__dirname, "../.."),
      // لا شيء يستمع على المنفذ 9: كل اتصال يُرفض فورًا. وقيمة مهلة لا تُقرأ لا توقف الخادم
      env: { ...osEnv, ...E2E_SERVER_ENV, PORT: String(PORT), APP_URL: BASE, DATABASE_URL: "postgres://edu:nothing@127.0.0.1:9/none", DATABASE_QUEUE_TIMEOUT_MS: "soon", NODE_ENV: "production" } as NodeJS.ProcessEnv,
      stdio: "ignore",
    });
    const started = Date.now();
    const api = await playwrightRequest.newContext();
    try {
      for (;;) {
        const up = await api.get(`${BASE}/api/health`).catch(() => null);
        if (up) break;
        if (server.exitCode !== null) throw new Error(`the server stopped with code ${server.exitCode}`);
        if (Date.now() - started > 60_000) throw new Error("the server did not start");
        await new Promise((done) => setTimeout(done, 500));
      }
    } finally {
      await api.dispose();
    }
  });

  test.afterAll(() => {
    server?.kill();
  });

  test("an API route answers 503 with Retry-After quickly, not a hang", async ({ request }) => {
    const t = Date.now();
    const res = await request.get(`${BASE}/api/lessons/6f1c2b8e-0d2f-4b7a-9a51-1c7e3b2d4f60/stream`);
    expect(res.status()).toBe(503);
    expect(res.headers()["retry-after"]).toBe("5");
    expect(await res.json()).toEqual({ error: expect.any(String), busy: true });
    expect(Date.now() - t).toBeLessThan(15_000);
  });

  test("a page shows the busy state, with no error code", async ({ page }) => {
    await page.goto(`${BASE}/teachers`);
    await expect(page.getByTestId("busy-title")).toBeVisible();
    await expect(page.getByText("رمز الخطأ للدعم")).toHaveCount(0);
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expectNoHorizontalOverflow(page);
    }
  });
});
