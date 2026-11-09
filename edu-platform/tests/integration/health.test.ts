import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/health/route";
import { resetEnvCache } from "@/server/env";
import { isSiteUp, resetHealthCacheForTests } from "@/server/platform/health";
import { resetOpsWatchdogForTests } from "@/server/platform/scheduled-jobs";
import { closeDb, resetDb, sql } from "../helpers/db";
import { TEST_ENV } from "../test-env";

async function breakDatabase() {
  await closeDb();
  process.env.DATABASE_URL = "postgres://edu:edu_local_pw@127.0.0.1:1/nothing";
  resetEnvCache();
}

async function repairDatabase() {
  await closeDb();
  process.env.DATABASE_URL = TEST_ENV.DATABASE_URL;
  resetEnvCache();
}

beforeAll(resetDb);
afterAll(closeDb);

beforeEach(() => {
  resetHealthCacheForTests();
  resetOpsWatchdogForTests();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await repairDatabase();
});

describe("/api/health", () => {
  it("answers up, and nothing else", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "up" });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("answers down with 503 when the database does not respond", async () => {
    await breakDatabase();
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: "down" });
  });

  it("does not ask the database on every request", async () => {
    expect((await GET()).status).toBe(200);
    await breakDatabase();
    expect((await GET()).status).toBe(200);
  });

  it("concurrent requests share one answer", async () => {
    const answers = await Promise.all(Array.from({ length: 20 }, () => GET()));
    expect(new Set(answers.map((r) => r.status))).toEqual(new Set([200]));
  });

  it("asks the database once for many requests at the same moment", async () => {
    let asked = 0;
    const slowProbe = async () => {
      asked++;
      await new Promise((resolve) => setTimeout(resolve, 50));
      return true;
    };
    const answers = await Promise.all(Array.from({ length: 20 }, () => isSiteUp(slowProbe)));
    expect(answers.every(Boolean)).toBe(true);
    expect(asked).toBe(1);
  });

  it("gives nothing away in its headers or body", async () => {
    const res = await GET();
    const text = JSON.stringify([[...res.headers.entries()], await res.text()]);
    expect(text).not.toMatch(/version|postgres|supabase|vercel|secret|count/i);
  });

  it("recovers on its own once the database is back and the short memory ends", async () => {
    await breakDatabase();
    expect((await GET()).status).toBe(503);
    await repairDatabase();
    resetHealthCacheForTests();
    expect((await GET()).status).toBe(200);
  });
});
