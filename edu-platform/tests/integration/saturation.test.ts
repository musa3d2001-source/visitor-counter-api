import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { configureStampGateForTests, StampBusyError, withStampSlot } from "@/server/access/stamp-gate";
import { DatabaseBusyError, toBusyError } from "@/server/db-busy";
import { saturationViews } from "@/server/platform/ops-status";
import { flushSaturation, noteSaturation, pendingSaturation, resetSaturationForTests, SATURATION_KINDS } from "@/server/platform/saturation";
import { closeDb, resetDb, sql } from "../helpers/db";

type Row = { kind: string; count: string };
const stored = async () => Object.fromEntries((await sql<Row[]>`select kind, count from saturation_counters`).map((r) => [r.kind, Number(r.count)]));

beforeAll(resetDb);
afterAll(closeDb);
beforeEach(async () => {
  await sql`truncate saturation_counters`;
  resetSaturationForTests();
});

describe("what is counted", () => {
  beforeEach(() => resetSaturationForTests({ holdWrites: true }));

  it("counts a busy error once however many layers it crosses", () => {
    const err = new DatabaseBusyError("queue");
    expect(toBusyError(err)).toBe(err);
    expect(toBusyError(toBusyError(err))).toBe(err);
    expect(pendingSaturation()).toEqual({ db_pool_wait: 1 });
  });

  it("counts a raw pool timeout once when it is converted", () => {
    expect(toBusyError(Object.assign(new Error("x"), { code: "QUEUE_TIMEOUT" }))).toBeInstanceOf(DatabaseBusyError);
    expect(pendingSaturation()).toEqual({ db_pool_wait: 1 });
  });

  it("separates waiting for a connection from a statement that ran out of time", () => {
    for (const reason of ["queue", "connect", "unavailable"] as const) new DatabaseBusyError(reason);
    for (const reason of ["statement", "idle_in_transaction"] as const) new DatabaseBusyError(reason);
    expect(pendingSaturation()).toEqual({ db_pool_wait: 3, db_deadline: 2 });
  });

  it("does not count ordinary errors or the hash gate's own refusal twice", () => {
    expect(toBusyError(new Error("23505 duplicate"))).toBeInstanceOf(Error);
    new DatabaseBusyError("hash");
    expect(pendingSaturation()).toEqual({});
  });

  it("a real statement timeout reaches the counter", async () => {
    await expect(sql.begin(async (tx) => {
      await tx`set local statement_timeout = 10`;
      await tx`select pg_sleep(0.2)`;
    })).rejects.toBeInstanceOf(DatabaseBusyError);
    expect(pendingSaturation().db_deadline).toBe(1);
  });

  it("a full stamping queue is counted, once per refused request", async () => {
    configureStampGateForTests({ slots: 1, queue: 0 });
    let finish!: () => void;
    const job = withStampSlot(() => new Promise<void>((r) => (finish = r)));
    await expect(withStampSlot(async () => undefined)).rejects.toBeInstanceOf(StampBusyError);
    await expect(withStampSlot(async () => undefined)).rejects.toBeInstanceOf(StampBusyError);
    expect(pendingSaturation().stamp_shed).toBe(2);
    finish();
    await job;
    configureStampGateForTests(null);
  });
});

describe("writing the counters", () => {
  it("the first event is written straight away, without waiting for a request", async () => {
    noteSaturation("login_shed");
    await vi.waitFor(async () => expect(await stored()).toEqual({ login_shed: 1 }));
    expect(pendingSaturation()).toEqual({});
  });

  it("then holds events and writes them in one statement at most every 30 seconds", async () => {
    noteSaturation("login_shed");
    await vi.waitFor(async () => expect(await stored()).toEqual({ login_shed: 1 }));
    for (let i = 0; i < 40; i++) noteSaturation("stamp_shed");
    noteSaturation("login_shed");
    await new Promise((r) => setTimeout(r, 60));
    expect(await stored()).toEqual({ login_shed: 1 });
    expect(pendingSaturation()).toEqual({ stamp_shed: 40, login_shed: 1 });
    await flushSaturation();
    expect(await stored()).toEqual({ login_shed: 2, stamp_shed: 40 });
  });

  it("adds to the same hour instead of multiplying rows", async () => {
    for (let round = 0; round < 3; round++) {
      noteSaturation("db_deadline");
      await flushSaturation();
    }
    expect(await sql`select 1 from saturation_counters`).toHaveLength(1);
    expect(await stored()).toEqual({ db_deadline: 3 });
  });

  it("a failed write loses nothing, throws nothing, and stops trying for a while", async () => {
    await sql`alter table saturation_counters rename to saturation_counters_away`;
    try {
      noteSaturation("login_shed");
      await vi.waitFor(() => expect(pendingSaturation().login_shed).toBe(1));
      await expect(flushSaturation()).resolves.toBeUndefined();
    } finally {
      await sql`alter table saturation_counters_away rename to saturation_counters`;
    }
    expect(pendingSaturation().login_shed).toBe(1);
    noteSaturation("login_shed");
    await new Promise((r) => setTimeout(r, 60));
    // الجدول عاد، لكن القاطع ما زال مفتوحًا: لا كتابة قبل أن تنتهي مهلته
    expect(await stored()).toEqual({});
    await flushSaturation();
    expect(await stored()).toEqual({ login_shed: 2 });
  });
});

describe("what the owner reads", () => {
  it("shows every kind in a fixed order, even at zero", async () => {
    expect((await saturationViews()).map((v) => [v.kind, v.lastDay, v.lastWeek])).toEqual(SATURATION_KINDS.map((k) => [k, 0, 0]));
  });

  it("separates the last day from the last week and ignores anything older", async () => {
    await sql`
      insert into saturation_counters (hour, kind, count) values
        (date_trunc('hour', now()), 'login_shed', 3),
        (date_trunc('hour', now()) - interval '2 days', 'login_shed', 4),
        (date_trunc('hour', now()) - interval '10 days', 'login_shed', 100)
    `;
    expect((await saturationViews()).find((v) => v.kind === "login_shed")).toEqual({ kind: "login_shed", lastDay: 3, lastWeek: 7 });
  });
});

describe("the table itself holds no personal data", () => {
  it("has only an hour, a fixed kind and a count", async () => {
    const columns = await sql<{ column_name: string }[]>`select column_name from information_schema.columns where table_name = 'saturation_counters' order by column_name`;
    expect(columns.map((c) => c.column_name)).toEqual(["count", "hour", "kind"]);
  });

  it("refuses a kind outside the fixed list", async () => {
    await expect(sql`insert into saturation_counters (hour, kind, count) values (now(), 'student@farqad.test', 1)`).rejects.toThrow();
  });

  it("is closed to the browser's database role like every other table", async () => {
    const [row] = await sql<{ relrowsecurity: boolean }[]>`select relrowsecurity from pg_class where relname = 'saturation_counters'`;
    expect(row.relrowsecurity).toBe(true);
  });
});
