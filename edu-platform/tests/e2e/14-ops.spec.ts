import { test, expect, request as playwrightRequest } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import { E2E_CRON_SECRET, E2E_DATABASE_URL } from "./e2e-env";
import { db, expectNoHorizontalOverflow, loginAdmin, newStudentPage } from "./helpers";

/**
 * المراقبة على الخادم الإنتاجي الفعلي: onRequestError لا يعمل إلا مع Next الحقيقي،
 * وبدء الخادم بمتغيرات Production و Preview الحالية بالضبط لا يثبته إلا تشغيله فعلًا.
 */
const OS_ONLY = ["PATH", "Path", "SystemRoot", "windir", "TEMP", "TMP", "HOME", "USERPROFILE", "ComSpec", "PATHEXT", "SystemDrive"];
const DEPLOYED_PORT = 3198;
const DEPLOYED_BASE = `http://127.0.0.1:${DEPLOYED_PORT}`;

/** الأسماء الأربعة عشر كما هي في Vercel اليوم: بلا CRON_SECRET ولا OPS_ALERT_EMAIL ولا مفاتيح دفع أو بريد */
const DEPLOYED: Record<string, string> = {
  TRUST_PROXY: "true",
  VIDEO_PROVIDER: "file",
  MAIL_DRIVER: "log",
  PAYMENTS_MODE: "disabled",
  SUPABASE_PUBLIC_BUCKET: "public-media",
  SUPABASE_PRIVATE_BUCKET: "private-content",
  SUPABASE_SERVICE_ROLE_KEY: "e2e-service-role-placeholder",
  SUPABASE_URL: "http://127.0.0.1:9/never-called",
  STORAGE_DRIVER: "supabase",
  DATABASE_POOL_MAX: "3",
  DATABASE_PGBOUNCER: "true",
  DATABASE_URL: E2E_DATABASE_URL,
  APP_SECRET: "e2e-app-secret-0123456789abcdef-0123456789",
  APP_URL: DEPLOYED_BASE,
};

function deployedServer(): ChildProcess {
  const osEnv = Object.fromEntries(OS_ONLY.flatMap((name) => (process.env[name] ? [[name, process.env[name]!]] : [])));
  return spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(DEPLOYED_PORT)], {
    cwd: resolve(__dirname, "../.."),
    env: { ...osEnv, ...DEPLOYED, NODE_ENV: "production" } as NodeJS.ProcessEnv,
    stdio: "ignore",
  });
}

test.describe("the live server", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "تكفي مرة واحدة على الكمبيوتر"));

  test("the health link answers up and nothing else", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ status: "up" });
  });

  test("scheduled jobs refuse without the secret", async ({ request }) => {
    for (const path of ["/api/cron/reconcile-payments", "/api/cron/expire-orders", "/api/cron/prune-data", "/api/cron/prepare-copies"]) {
      expect((await request.get(path)).status(), path).toBe(401);
      expect((await request.get(path, { headers: { authorization: "Bearer wrong-wrong-wrong-wrong" } })).status(), path).toBe(401);
    }
  });

  test("a job run with the secret shows on the owner page", async ({ request, page }) => {
    const res = await request.get("/api/cron/prune-data", { headers: { authorization: `Bearer ${E2E_CRON_SECRET}` } });
    expect(res.status()).toBe(200);
    await loginAdmin(page);
    await page.goto("/admin/ops");
    await expect(page.getByTestId("ops-page")).toBeVisible();
    await expect(page.locator('[data-testid="ops-job"][data-job="prune-data"]')).toHaveAttribute("data-status", "ok");
    await expect(page.getByTestId("ops-warning-cron")).toHaveCount(0);
    await expect(page.getByTestId("ops-warning-alert-email")).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });

  test("the owner reads how often the site was full, by kind, last day and last week", async ({ page }) => {
    await db()`delete from saturation_counters`;
    await db()`
      insert into saturation_counters (hour, kind, count) values
        (date_trunc('hour', now()), 'login_shed', 12),
        (date_trunc('hour', now()) - interval '3 days', 'login_shed', 30),
        (date_trunc('hour', now()), 'stamp_shed', 4)
    `;
    await loginAdmin(page);
    await page.goto("/admin/ops#saturation");
    const rows = page.getByTestId("ops-saturation-row");
    await expect(rows).toHaveCount(5);
    const login = page.locator('[data-testid="ops-saturation-row"][data-kind="login_shed"]');
    await expect(login).toHaveAttribute("data-day", "12");
    await expect(login).toHaveAttribute("data-week", "42");
    await expect(page.locator('[data-testid="ops-saturation-row"][data-kind="db_deadline"]')).toHaveAttribute("data-week", "0");
    await expectNoHorizontalOverflow(page);
  });

  test("the owner sends a test alert and is told it was only logged, since this server's mail is not real", async ({ page }) => {
    await db()`delete from email_log where template = 'ops_alert_test'`;
    await db()`delete from rate_limits where key like 'ops_test_alert:%'`;
    await loginAdmin(page);
    await page.goto("/admin/ops#test-alert");
    await page.getByRole("button", { name: "أرسل رسالة تجربة" }).click();
    await expect(page.getByText("سُجلت الرسالة ولم تخرج إلى أحد")).toBeVisible();
    await page.reload();
    await expect(page.getByTestId("ops-alert-delivery")).toHaveAttribute("data-delivery", "logged");
    expect(await db()`select 1 from email_log where template = 'ops_alert_test'`).toHaveLength(1);
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expectNoHorizontalOverflow(page);
    }
  });

  test("an uncaught server failure reaches the owner page without the link or the session", async ({ request, page }) => {
    await db()`delete from error_events where route like '%teachers%'`;
    await db()`alter table teachers rename to teachers_moved_for_test`;
    try {
      await request.get("/teachers?token=e2e-secret-query-value", { headers: { cookie: "edu_session=e2e-secret-cookie-value" } });
    } finally {
      await db()`alter table teachers_moved_for_test rename to teachers`;
    }
    await expect.poll(async () => (await db()`select 1 from error_events where route like '%teachers%'`).length, { timeout: 15_000 }).toBeGreaterThan(0);
    const stored = JSON.stringify(await db()`select source, route, message, stack, digest from error_events where route like '%teachers%'`);
    expect(stored).not.toMatch(/e2e-secret-query-value|e2e-secret-cookie-value/);
    await loginAdmin(page);
    await page.goto("/admin/ops");
    await expect(page.getByTestId("ops-error").first()).toBeVisible();
  });

  test("a student cannot reach the owner page", async ({ browser }) => {
    const { page: student, ctx } = await newStudentPage(browser);
    const res = await student.goto("/admin/ops");
    expect(res?.status()).toBe(404);
    await ctx.close();
  });
});

test.describe("the environment deployed today", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "تكفي مرة واحدة على الكمبيوتر"));
  test.describe.configure({ mode: "serial" });

  let server: ChildProcess;

  test.beforeAll(async ({}, info) => {
    if (info.project.name !== "desktop") return;
    test.setTimeout(90_000);
    server = deployedServer();
    const started = Date.now();
    const api = await playwrightRequest.newContext();
    try {
      for (;;) {
        const up = await api.get(`${DEPLOYED_BASE}/api/health`).catch(() => null);
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

  test("boots and serves with exactly the fourteen variables", async ({ playwright }) => {
    expect(server.exitCode).toBeNull();
    const api = await playwright.request.newContext({ baseURL: DEPLOYED_BASE });
    try {
      expect((await api.get("/")).status()).toBe(200);
      const health = await api.get("/api/health");
      expect(health.status()).toBe(200);
      expect(await health.json()).toEqual({ status: "up" });
    } finally {
      await api.dispose();
    }
  });

  test("a job is refused, not a crash, when CRON_SECRET does not exist", async ({ playwright }) => {
    const api = await playwright.request.newContext({ baseURL: DEPLOYED_BASE });
    try {
      for (const header of [undefined, "Bearer undefined", "Bearer "]) {
        const res = await api.get("/api/cron/expire-orders", { headers: header ? { authorization: header } : {} });
        expect(res.status()).toBe(401);
      }
      expect((await api.get("/api/health")).status()).toBe(200);
    } finally {
      await api.dispose();
    }
    expect(server.exitCode).toBeNull();
  });
});
