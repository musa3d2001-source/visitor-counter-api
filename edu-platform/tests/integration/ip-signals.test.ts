import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { listAccountIpSignals } from "@/server/admin/access-signals";
import { hashToken } from "@/server/auth/session";
import { closeDb, resetDb, sql } from "../helpers/db";
import { createUser } from "../helpers/factories";

beforeEach(async () => {
  await resetDb();
});
afterAll(async () => {
  await closeDb();
});

describe("the signal of many addresses", () => {
  async function seen(userId: string | null, ips: string[], opts: { action?: string; ago?: string; via?: "log" | "session" } = {}) {
    for (const ip of ips) {
      if (opts.via === "session") {
        await sql`insert into sessions (id, user_id, expires_at, ip, created_at) values (${hashToken(`${userId}${ip}${Math.random()}`)}, ${userId}, now() + interval '1 day', ${ip}, now() - ${opts.ago ?? "1 hour"}::interval)`;
      } else {
        await sql`insert into access_logs (user_id, action, ip, created_at) values (${userId}, ${opts.action ?? "view"}, ${ip}, now() - ${opts.ago ?? "1 hour"}::interval)`;
      }
    }
  }
  const addresses = (n: number, prefix = "10.0.0") => Array.from({ length: n }, (_, i) => `${prefix}.${i + 1}`);

  it("lists a student at the threshold and not below it", async () => {
    const below = await createUser();
    const at = await createUser();
    await seen(below.id, addresses(7));
    await seen(at.id, addresses(8));
    const rows = await listAccountIpSignals();
    expect(rows.map((r) => r.id)).toEqual([at.id]);
    expect(rows[0].distinct_ips).toBe(8);
  });

  it("counts an address once, across logs and sessions", async () => {
    const student = await createUser();
    await seen(student.id, addresses(5));
    await seen(student.id, addresses(5));
    await seen(student.id, addresses(5, "10.0.0"), { via: "session" });
    expect(await listAccountIpSignals()).toHaveLength(0);
    await seen(student.id, addresses(3, "10.0.9"), { via: "session" });
    expect((await listAccountIpSignals())[0].distinct_ips).toBe(8);
  });

  it("ignores old activity, denied requests and unknown addresses", async () => {
    const student = await createUser();
    await seen(student.id, addresses(8), { ago: "8 days" });
    await seen(student.id, addresses(8, "10.0.1"), { action: "denied" });
    await seen(student.id, ["unknown"]);
    await sql`insert into access_logs (user_id, action, ip) values (${student.id}, 'view', null)`;
    expect(await listAccountIpSignals()).toHaveLength(0);
  });

  it("does not count an unknown address toward the threshold, from either source", async () => {
    const viaLog = await createUser();
    await seen(viaLog.id, [...addresses(7), "unknown"]);
    const viaSession = await createUser();
    await seen(viaSession.id, addresses(7));
    await seen(viaSession.id, ["unknown"], { via: "session" });
    expect(await listAccountIpSignals()).toHaveLength(0);
  });

  it("lists students only", async () => {
    for (const role of ["teacher", "admin"] as const) {
      const user = await createUser({ role });
      await seen(user.id, addresses(12));
    }
    expect(await listAccountIpSignals()).toHaveLength(0);
  });

  it("returns counts, never the addresses", async () => {
    const student = await createUser();
    await seen(student.id, addresses(9, "198.51.100"));
    const rows = await listAccountIpSignals();
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain("198.51.100");
  });

  it("orders the highest first", async () => {
    const a = await createUser();
    const b = await createUser();
    await seen(a.id, addresses(8));
    await seen(b.id, addresses(11));
    expect((await listAccountIpSignals()).map((r) => r.id)).toEqual([b.id, a.id]);
  });
});
