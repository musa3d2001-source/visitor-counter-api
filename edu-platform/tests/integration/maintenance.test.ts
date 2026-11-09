import { randomBytes } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { IP_SIGNAL, listAccountIpSignals } from "@/server/admin/access-signals";
import { ACCESS_LOG_RETENTION_DAYS, ERROR_EVENT_RETENTION_DAYS, PRUNE_BATCH_SIZE, runDataPruning } from "@/server/platform/maintenance";
import { closeDb, resetDb, sql } from "../helpers/db";
import { createUser } from "../helpers/factories";

const count = async (table: "rate_limits" | "sessions" | "access_logs" | "error_events") => (await sql<{ n: number }[]>`select count(*)::int as n from ${sql(table)}`)[0].n;

const sessionId = () => randomBytes(32).toString("hex");

async function addSession(userId: string, createdDaysAgo: number, expiresInDays: number, ip = "10.0.0.1") {
  await sql`
    insert into sessions (id, user_id, ip, created_at, expires_at)
    values (${sessionId()}, ${userId}, ${ip}, now() - make_interval(days => ${createdDaysAgo}), now() + make_interval(days => ${expiresInDays}))
  `;
}

async function addLog(userId: string, daysAgo: number, ip = "10.0.0.1") {
  await sql`insert into access_logs (user_id, action, ip, created_at) values (${userId}, 'view', ${ip}, now() - make_interval(days => ${daysAgo}))`;
}

beforeAll(resetDb);
afterAll(closeDb);

beforeEach(async () => {
  await sql`truncate rate_limits, sessions, access_logs, error_events restart identity cascade`;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.doUnmock("@/server/admin/access-signals");
});

describe("rate limits", () => {
  it("removes only those that ended more than a day ago", async () => {
    await sql`insert into rate_limits (key, count, reset_at) values ('old', 1, now() - interval '2 days'), ('recent', 1, now() - interval '1 hour'), ('active', 1, now() + interval '1 hour')`;
    expect(await runDataPruning()).toMatchObject({ rateLimits: 1 });
    expect((await sql<{ key: string }[]>`select key from rate_limits order by key`).map((r) => r.key)).toEqual(["active", "recent"]);
  });
});

describe("sessions", () => {
  it("removes an expired session older than the sharing window", async () => {
    const user = await createUser();
    await addSession(user.id, 40, -10);
    expect(await runDataPruning()).toMatchObject({ sessions: 1 });
    expect(await count("sessions")).toBe(0);
  });

  it("keeps a live session however old it is", async () => {
    const user = await createUser();
    await addSession(user.id, 40, 5);
    await runDataPruning();
    expect(await count("sessions")).toBe(1);
  });

  it("keeps an expired session still inside the sharing window, because the signal reads it", async () => {
    const user = await createUser();
    await addSession(user.id, IP_SIGNAL.windowDays - 1, -1);
    await runDataPruning();
    expect(await count("sessions")).toBe(1);
  });
});

describe("access logs", () => {
  it("removes what is older than the retention period", async () => {
    const user = await createUser();
    await addLog(user.id, ACCESS_LOG_RETENTION_DAYS + 2);
    expect(await runDataPruning()).toMatchObject({ accessLogs: 1 });
    expect(await count("access_logs")).toBe(0);
  });

  it("keeps what is inside the retention period", async () => {
    const user = await createUser();
    await addLog(user.id, ACCESS_LOG_RETENTION_DAYS - 2);
    await runDataPruning();
    expect(await count("access_logs")).toBe(1);
  });

  it("the retention is longer than the many-IPs window", () => {
    expect(ACCESS_LOG_RETENTION_DAYS).toBeGreaterThan(IP_SIGNAL.windowDays);
  });

  it("the many-IPs signal reads the same after pruning", async () => {
    const user = await createUser();
    for (let i = 0; i < IP_SIGNAL.minDistinctIps; i++) await addLog(user.id, IP_SIGNAL.windowDays - 1, `10.1.0.${i + 1}`);
    await addLog(user.id, ACCESS_LOG_RETENTION_DAYS + 5, "10.9.9.9");
    const before = await listAccountIpSignals();
    expect(before.map((s) => s.id)).toContain(user.id);
    await runDataPruning();
    expect((await listAccountIpSignals()).find((s) => s.id === user.id)?.distinct_ips).toBe(before.find((s) => s.id === user.id)?.distinct_ips);
  });

  it("never reaches into the window, even if the window grows past the retention", async () => {
    vi.resetModules();
    vi.doMock("@/server/admin/access-signals", () => ({ IP_SIGNAL: { windowDays: ACCESS_LOG_RETENTION_DAYS + 30, minDistinctIps: 8, limit: 100 } }));
    const fresh = await import("@/server/platform/maintenance");
    const user = await createUser();
    await addLog(user.id, ACCESS_LOG_RETENTION_DAYS + 20);
    await fresh.runDataPruning();
    expect(await count("access_logs")).toBe(1);
  });
});

describe("error events", () => {
  it("removes what has not been seen for a month", async () => {
    await sql`insert into error_events (fingerprint, source, message, last_seen_at) values (${"a".repeat(64)}, 'old', 'm', now() - make_interval(days => ${ERROR_EVENT_RETENTION_DAYS + 1})), (${"b".repeat(64)}, 'new', 'm', now())`;
    expect(await runDataPruning()).toMatchObject({ errorEvents: 1 });
    expect((await sql<{ source: string }[]>`select source from error_events`).map((r) => r.source)).toEqual(["new"]);
  });
});

describe("each run is bounded and repeatable", () => {
  it("stops at its ceiling and the next run finishes", async () => {
    await sql`insert into rate_limits (key, count, reset_at) select 'k' || g, 1, now() - interval '3 days' from generate_series(1, ${PRUNE_BATCH_SIZE * 10 + 500}) g`;
    expect(await runDataPruning()).toMatchObject({ rateLimits: PRUNE_BATCH_SIZE * 10, finished: false });
    expect(await runDataPruning()).toMatchObject({ rateLimits: 500, finished: true });
  });

  it("two overlapping runs delete each row once and neither fails", async () => {
    await sql`insert into rate_limits (key, count, reset_at) select 'k' || g, 1, now() - interval '3 days' from generate_series(1, 3000) g`;
    const [a, b] = await Promise.all([runDataPruning(), runDataPruning()]);
    expect(a.rateLimits + b.rateLimits).toBe(3000);
    expect(await count("rate_limits")).toBe(0);
  });

  it("a second run with nothing left does nothing", async () => {
    await runDataPruning();
    expect(await runDataPruning()).toEqual({ rateLimits: 0, sessions: 0, accessLogs: 0, errorEvents: 0, finished: true });
  });
});
