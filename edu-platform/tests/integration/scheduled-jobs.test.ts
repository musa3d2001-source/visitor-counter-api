import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as expireOrders } from "@/app/api/cron/expire-orders/route";
import { GET as pruneData } from "@/app/api/cron/prune-data/route";
import { GET as prepareCopies } from "@/app/api/cron/prepare-copies/route";
import { GET as reconcilePayments } from "@/app/api/cron/reconcile-payments/route";
import { resetEnvCache } from "@/server/env";
import { closeExpiredOrders } from "@/server/payments/reconcile";
import { resetErrorReporterForTests } from "@/server/platform/report-error";
import { JOB_STALE_AFTER_HOURS, jobStatusOf, listJobHeartbeats, reconcileCadence, resetOpsWatchdogForTests, runOpsWatchdog, runOpsWatchdogAfterResponse, runScheduledJob, SCHEDULED_JOBS, serveCron } from "@/server/platform/scheduled-jobs";
import { opsConfig, opsSummary } from "@/server/platform/ops-status";
import { closeDb, resetDb, sql } from "../helpers/db";
import { makeStale, newOrder, orderRow } from "../helpers/payment-flow";

const SECRET = "cron-secret-0123456789abcdef";
const ROUTES = [
  ["/api/cron/reconcile-payments", reconcilePayments],
  ["/api/cron/expire-orders", expireOrders],
  ["/api/cron/prune-data", pruneData],
  ["/api/cron/prepare-copies", prepareCopies],
] as const;

const request = (path: string, authorization?: string) => new Request(`http://localhost:3000${path}`, { headers: authorization ? { authorization } : {} });

type Beat = { job: string; last_started_at: Date | null; last_success_at: Date | null; last_error_at: Date | null; last_error: string | null; last_report: unknown; lease_until: Date | null };
const beat = async (job: string) => (await sql<Beat[]>`select job, last_started_at, last_success_at, last_error_at, last_error, last_report, lease_until from job_heartbeats where job = ${job}`)[0];
const alerts = () => sql<{ subject: string }[]>`select subject from email_log where template = 'ops_alert' order by created_at`;

beforeAll(resetDb);
afterAll(closeDb);

beforeEach(async () => {
  await sql`truncate job_heartbeats, ops_alert_state, error_events, email_log restart identity`;
  process.env.CRON_SECRET = SECRET;
  process.env.OPS_ALERT_EMAIL = "owner@darb.school";
  resetEnvCache();
  resetErrorReporterForTests();
  resetOpsWatchdogForTests();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.CRON_SECRET;
  delete process.env.OPS_ALERT_EMAIL;
  resetEnvCache();
});

describe.each(ROUTES)("%s", (path, handler) => {
  // الرفض يوقظ فحص التنبيهات (الذي ينشئ صفوف النبض الفارغة)، لكن الوظيفة نفسها لا تبدأ
  it("refuses with no secret, and does no work", async () => {
    expect((await handler(request(path))).status).toBe(401);
    expect((await beat(path.split("/").pop()!))?.last_started_at ?? null).toBeNull();
  });

  it("refuses the wrong secret, and does no work", async () => {
    expect((await handler(request(path, "Bearer wrong-secret-0123456789abcdef"))).status).toBe(401);
    expect((await beat(path.split("/").pop()!))?.last_started_at ?? null).toBeNull();
  });

  it("refuses everyone when CRON_SECRET is not configured, without crashing", async () => {
    delete process.env.CRON_SECRET;
    resetEnvCache();
    expect((await handler(request(path))).status).toBe(401);
    expect((await handler(request(path, "Bearer undefined"))).status).toBe(401);
  });

  it("runs with the right secret and records a heartbeat", async () => {
    const res = await handler(request(path, `Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    const row = await beat(path.split("/").pop()!);
    expect(row.last_started_at).not.toBeNull();
    expect(row.last_success_at).not.toBeNull();
    expect(row.last_error).toBeNull();
    expect(row.lease_until).toBeNull();
  });

  it("is safe to run twice", async () => {
    expect((await handler(request(path, `Bearer ${SECRET}`))).status).toBe(200);
    expect((await handler(request(path, `Bearer ${SECRET}`))).status).toBe(200);
  });
});

describe("a job cannot overlap itself", () => {
  function deferred() {
    let release!: () => void;
    const promise = new Promise<void>((done) => (release = done));
    return { promise, release };
  }

  it("the second run does nothing and is not recorded as a success", async () => {
    const gate = deferred();
    let runs = 0;
    const first = runScheduledJob("prune-data", async () => {
      runs++;
      await gate.promise;
      return { done: true };
    });
    await vi.waitFor(async () => expect((await beat("prune-data"))?.lease_until).toBeTruthy());
    const second = await runScheduledJob("prune-data", async () => {
      runs++;
      return { done: true };
    });
    expect(second.state).toBe("overlapped");
    expect((await beat("prune-data")).last_success_at).toBeNull();
    gate.release();
    await expect(first).resolves.toMatchObject({ state: "done" });
    expect(runs).toBe(1);
  });

  it("eight started at the same moment run once", async () => {
    const gate = deferred();
    let runs = 0;
    let settled = 0;
    const pending = Array.from({ length: 8 }, () =>
      runScheduledJob("expire-orders", async () => {
        runs++;
        await gate.promise;
      }).finally(() => settled++),
    );
    // الفائز يمسك العقد حتى تُفتح البوابة، فكل استدعاء آخر يجده. ننتظر عودتهم، أو لحظة إن كان أكثر من واحد قد فاز
    await vi.waitFor(() => expect(settled).toBe(7), { timeout: 2000, interval: 10 }).catch(() => undefined);
    gate.release();
    const results = await Promise.all(pending);
    expect(runs).toBe(1);
    expect(results.filter((r) => r.state === "overlapped")).toHaveLength(7);
  });

  it("an overlapped request gets a plain 200, because Vercel does not retry", async () => {
    await sql`insert into job_heartbeats (job, lease_until) values ('prune-data', now() + interval '5 minutes')`;
    const res = await pruneData(request("/api/cron/prune-data", `Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ skipped: "already_running" });
  });

  it("a run that died does not block the next one forever", async () => {
    await sql`insert into job_heartbeats (job, lease_until) values ('prune-data', now() - interval '1 minute')`;
    await expect(runScheduledJob("prune-data", async () => ({ ok: 1 }))).resolves.toMatchObject({ state: "done" });
  });

  it("different jobs do not block each other", async () => {
    await sql`insert into job_heartbeats (job, lease_until) values ('prune-data', now() + interval '5 minutes')`;
    await expect(runScheduledJob("expire-orders", async () => ({ ok: 1 }))).resolves.toMatchObject({ state: "done" });
  });
});

describe("when a job fails", () => {
  const throwing = () => Promise.reject(new Error("failed for sara@students.kw at row 3f2b1c9a-1111-4222-8333-444455556666"));

  it("records the failure scrubbed, releases the job, and keeps the last success", async () => {
    await runScheduledJob("prune-data", async () => ({ ok: 1 }));
    const { last_success_at: before } = await beat("prune-data");
    const run = await runScheduledJob("prune-data", throwing);
    expect(run.state).toBe("failed");
    const row = await beat("prune-data");
    expect(row.last_error_at).not.toBeNull();
    expect(row.last_error).not.toMatch(/sara|3f2b1c9a/);
    expect(row.last_success_at).toEqual(before);
    expect(row.lease_until).toBeNull();
  });

  it("tells the owner and records the error", async () => {
    await runScheduledJob("prune-data", throwing);
    expect((await alerts()).map((m) => m.subject).join(" ")).toContain("فشلت وظيفة مجدولة");
    expect(await sql`select 1 from error_events where source = 'cron:prune-data'`).toHaveLength(1);
  });

  it("a storm of failures sends one failure message", async () => {
    for (let i = 0; i < 5; i++) await runScheduledJob("prune-data", throwing);
    expect((await alerts()).filter((m) => m.subject.includes("فشلت وظيفة"))).toHaveLength(1);
  });

  it("answers the caller with no detail", async () => {
    const res = await serveCron(request("/x", `Bearer ${SECRET}`), "prune-data", throwing);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "job failed" });
  });

  it("a report that counts as failure is 502 and carries only the numbers", async () => {
    const res = await serveCron(
      request("/x", `Bearer ${SECRET}`),
      "reconcile-payments",
      async () => ({ errors: 3, checked: 0 }),
      (report) => (report.errors > 0 && report.checked === 0 ? "لم تجب بوابة الدفع عن أي فاتورة" : null),
    );
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ errors: 3, checked: 0 });
    const row = await beat("reconcile-payments");
    expect(row.last_error).toContain("بوابة الدفع");
    expect(row.last_report).toEqual({ errors: 3, checked: 0 });
    expect(row.last_success_at).toBeNull();
  });

  it("a database that is down does not crash the route", async () => {
    await sql`alter table job_heartbeats rename to job_heartbeats_moved`;
    let status = 0;
    try {
      status = (await pruneData(request("/api/cron/prune-data", `Bearer ${SECRET}`))).status;
    } finally {
      await sql`alter table job_heartbeats_moved rename to job_heartbeats`;
    }
    expect(status).toBe(500);
  });
});

describe("expiring orders", () => {
  it("closes an old unpaid order that never reached the gateway, once", async () => {
    const { order } = await newOrder();
    await makeStale(order.id);
    const first = await expireOrders(request("/api/cron/expire-orders", `Bearer ${SECRET}`));
    expect(await first.json()).toMatchObject({ closed: 1, finished: true });
    expect((await orderRow(order.id)).status).toBe("cancelled");
    const again = await expireOrders(request("/api/cron/expire-orders", `Bearer ${SECRET}`));
    expect(await again.json()).toMatchObject({ closed: 0 });
  });

  it("leaves an order alone before its time", async () => {
    const { order } = await newOrder();
    await expireOrders(request("/api/cron/expire-orders", `Bearer ${SECRET}`));
    expect((await orderRow(order.id)).status).toBe("pending");
    await sql`update orders set status = 'cancelled' where id = ${order.id}`;
  });

  it("does not close an order whose invoice was never answered for", async () => {
    const { order } = await newOrder();
    await makeStale(order.id);
    await sql`
      insert into payments (order_id, provider, amount_fils, status, gateway_invoice_id, environment)
      values (${order.id}, 'myfatoorah', ${order.total_fils}, 'pending', ${`inv-${order.id}`}, 'sandbox')
    `;
    await closeExpiredOrders();
    expect((await orderRow(order.id)).status).toBe("pending");
    await sql`delete from payments where order_id = ${order.id}`;
    await sql`update orders set status = 'cancelled' where id = ${order.id}`;
  });

  it("is bounded per run and finishes on the next one", async () => {
    const orders = await Promise.all(Array.from({ length: 55 }, () => newOrder()));
    await sql`update orders set created_at = now() - interval '4 days' where id = any(${orders.map((o) => o.order.id)}::uuid[])`;
    expect(await closeExpiredOrders({ rounds: 1 })).toMatchObject({ closed: 50, finished: false });
    expect(await closeExpiredOrders({ rounds: 1 })).toMatchObject({ closed: 5, finished: true });
  });

  it("two overlapping runs close each order once", async () => {
    const orders = await Promise.all(Array.from({ length: 12 }, () => newOrder()));
    await sql`update orders set created_at = now() - interval '4 days' where id = any(${orders.map((o) => o.order.id)}::uuid[])`;
    const [a, b] = await Promise.all([closeExpiredOrders({ rounds: 2 }), closeExpiredOrders({ rounds: 2 })]);
    expect(a.closed + b.closed).toBe(12);
  });

  it("gives up on abandoned payment attempts in bounded batches", async () => {
    const { order } = await newOrder();
    await sql`
      insert into payments (order_id, provider, amount_fils, status, environment, created_at)
      select ${order.id}, 'myfatoorah', ${order.total_fils}, 'initiated', 'sandbox', now() - interval '2 hours' from generate_series(1, 205)
    `;
    expect((await closeExpiredOrders()).abandonedClaims).toBe(200);
    expect((await closeExpiredOrders()).abandonedClaims).toBe(5);
    await sql`update orders set status = 'cancelled' where id = ${order.id}`;
  });
});

describe("the status the owner sees", () => {
  const NOW = Date.parse("2026-11-10T12:00:00Z");
  const at = (hoursAgo: number) => new Date(NOW - hoursAgo * 3600_000);
  const row = (patch: Partial<{ last_started_at: Date | null; last_success_at: Date | null; last_error_at: Date | null; created_at: Date }>) => ({ last_started_at: null, last_success_at: null, last_error_at: null, created_at: at(1), ...patch });

  it.each([
    ["ran recently", row({ last_success_at: at(2) }), "ok"],
    ["ran within the daily window", row({ last_success_at: at(JOB_STALE_AFTER_HOURS - 1) }), "ok"],
    ["has not run for too long", row({ last_success_at: at(JOB_STALE_AFTER_HOURS + 1) }), "late"],
    ["failed after its last success", row({ last_success_at: at(5), last_error_at: at(1) }), "failed"],
    ["succeeded after a failure", row({ last_success_at: at(1), last_error_at: at(5) }), "ok"],
    ["failed and never worked", row({ last_error_at: at(1) }), "failed"],
    ["was just deployed", row({}), "never"],
    ["never ran in a long time", row({ created_at: at(JOB_STALE_AFTER_HOURS + 1) }), "late"],
  ])("a job that %s", (_label, heartbeat, expected) => {
    expect(jobStatusOf(heartbeat, NOW)).toBe(expected);
  });

  it("every registered job has a row from the first look", async () => {
    expect((await listJobHeartbeats()).map((j) => j.job)).toEqual([...SCHEDULED_JOBS]);
  });

  it("warns about a missing secret and a missing address, and does not crash", async () => {
    delete process.env.CRON_SECRET;
    delete process.env.OPS_ALERT_EMAIL;
    resetEnvCache();
    const summary = await opsSummary();
    expect(summary.cronConfigured).toBe(false);
    expect(summary.alertEmailConfigured).toBe(false);
  });

  it("a secret too short to work is reported as not configured", () => {
    process.env.CRON_SECRET = "short";
    resetEnvCache();
    expect(opsConfig().cronConfigured).toBe(false);
  });

  it("counts jobs that need attention and recent errors", async () => {
    await sql`insert into job_heartbeats (job, last_error_at, last_error) values ('prune-data', now(), 'x')`;
    await sql`insert into error_events (fingerprint, source, message) values (${"a".repeat(64)}, 's', 'm')`;
    await sql`insert into error_events (fingerprint, source, message, last_seen_at) values (${"b".repeat(64)}, 's', 'm', now() - interval '2 days')`;
    expect(await opsSummary()).toMatchObject({ jobsNeedingAttention: 1, errorsLast24h: 1 });
  });
});

describe("the watchdog", () => {
  it("does not raise the alarm the day it is deployed", async () => {
    await runOpsWatchdog({ force: true });
    expect(await alerts()).toHaveLength(0);
  });

  it("reports a job that stopped running", async () => {
    await sql`insert into job_heartbeats (job, last_success_at) values ('prune-data', now() - interval '3 days')`;
    await runOpsWatchdog({ force: true });
    expect((await alerts())[0].subject).toContain("لم تعمل في موعدها");
  });

  it("reports jobs that never ran at all, after the grace period", async () => {
    await listJobHeartbeats();
    await sql`update job_heartbeats set created_at = now() - interval '2 days'`;
    await runOpsWatchdog({ force: true });
    expect(await alerts()).toHaveLength(1);
  });

  it("a refused cron call still reports jobs that stopped, which is when the secret is missing", async () => {
    await sql`insert into job_heartbeats (job, last_success_at) values ('prune-data', now() - interval '3 days')`;
    delete process.env.CRON_SECRET;
    resetEnvCache();
    expect((await pruneData(request("/api/cron/prune-data"))).status).toBe(401);
    expect((await alerts())[0]?.subject).toContain("لم تعمل في موعدها");
  });

  it("an owner page load runs it, so a full cron stop is noticed without an outside monitor", async () => {
    await sql`insert into job_heartbeats (job, last_success_at) values ('expire-orders', now() - interval '3 days')`;
    await runOpsWatchdogAfterResponse();
    expect((await alerts())[0]?.subject).toContain("لم تعمل في موعدها");
    const root = resolve(__dirname, "../..");
    for (const page of ["src/app/admin/page.tsx", "src/app/admin/ops/page.tsx"]) {
      expect(readFileSync(resolve(root, page), "utf8"), page).toContain("await runOpsWatchdogAfterResponse();");
    }
  });

  it("checks at most every five minutes unless asked", async () => {
    await runOpsWatchdog();
    await sql`insert into job_heartbeats (job, last_success_at) values ('expire-orders', now() - interval '3 days') on conflict (job) do update set last_success_at = excluded.last_success_at`;
    await runOpsWatchdog();
    expect(await alerts()).toHaveLength(0);
  });

  it("never throws", async () => {
    await sql`alter table job_heartbeats rename to job_heartbeats_moved`;
    try {
      await expect(runOpsWatchdog({ force: true })).resolves.toBeUndefined();
    } finally {
      await sql`alter table job_heartbeats_moved rename to job_heartbeats`;
    }
  });
});

describe("vercel.json", () => {
  const root = resolve(__dirname, "../..");
  const config = JSON.parse(readFileSync(resolve(root, "vercel.json"), "utf8")) as { regions: string[]; crons: { path: string; schedule: string }[] };
  const readme = readFileSync(resolve(root, "README.md"), "utf8");

  /** يوميًا على الأكثر: الدقيقة والساعة قيمتان ثابتتان. أي شيء أكثر تكرارًا يُفشل نشر Hobby كله */
  const isAtMostDaily = (schedule: string) => {
    const [minute, hour] = schedule.split(" ");
    return /^\d+$/.test(minute) && /^\d+$/.test(hour);
  };

  it("runs functions in Frankfurt", () => {
    expect(config.regions).toEqual(["fra1"]);
  });

  it("every job is on the list and every entry is a job", () => {
    expect(config.crons.map((c) => c.path.split("/").pop()).sort()).toEqual([...SCHEDULED_JOBS].sort());
    expect(config.crons.length).toBeLessThanOrEqual(100);
  });

  it("every job other than reconcile is at most daily", () => {
    for (const cron of config.crons.filter((c) => !c.path.endsWith("reconcile-payments"))) expect(isAtMostDaily(cron.schedule), cron.path).toBe(true);
  });

  it("reconcile is daily on Hobby, or the one documented schedule after upgrading to Pro", () => {
    const reconcile = config.crons.find((c) => c.path.endsWith("reconcile-payments"))!;
    expect(["0 0 * * *", "*/10 * * * *"]).toContain(reconcile.schedule);
    expect(reconcileCadence()).toBe(reconcile.schedule === "0 0 * * *" ? "daily" : "frequent");
  });

  it("each job runs in its own hour, because Hobby may fire any minute within it, and reconcile comes before expiry", () => {
    const hours = config.crons.map((c) => c.schedule.split(" ")[1]);
    if (config.crons.every((c) => isAtMostDaily(c.schedule))) {
      expect(new Set(hours).size).toBe(hours.length);
      expect(Number(config.crons.find((c) => c.path.endsWith("reconcile-payments"))!.schedule.split(" ")[1])).toBeLessThan(Number(config.crons.find((c) => c.path.endsWith("expire-orders"))!.schedule.split(" ")[1]));
    }
  });

  it.each(ROUTES)("%s exists, is dynamic and fits inside the function limit", (path) => {
    const file = resolve(root, `src/app${path}/route.ts`);
    expect(existsSync(file)).toBe(true);
    const source = readFileSync(file, "utf8");
    expect(source).toContain('export const dynamic = "force-dynamic"');
    expect(Number(source.match(/export const maxDuration = (\d+)/)?.[1])).toBeLessThanOrEqual(300);
  });

  it("the README gives the single edit for Pro and the failure mode", () => {
    expect(readme).toContain("`0 0 * * *`");
    expect(readme).toContain("`*/10 * * * *`");
    expect(readme).toMatch(/سطر واحد|تعديل واحد/);
    expect(readme).toContain("قبل الدفع الحقيقي");
  });
});
