import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isDatabaseBusy } from "@/server/db-busy";
import { configureHashGateForTests, HASH_GATE_DEFAULTS, hashGateState, isHashBusy, withHashSlot } from "@/server/auth/hash-gate";
import { pendingSaturation, resetSaturationForTests } from "@/server/platform/saturation";

const core = vi.hoisted(() => ({ inFlight: 0, peak: 0, calls: 0 }));
vi.mock("@/server/auth/password-core", async (original) => {
  const actual = await original<typeof import("@/server/auth/password-core")>();
  const counted = async <T>(value: T): Promise<T> => {
    core.calls++;
    core.inFlight++;
    core.peak = Math.max(core.peak, core.inFlight);
    await new Promise((r) => setTimeout(r, 5));
    core.inFlight--;
    return value;
  };
  return { ...actual, hashPassword: () => counted("hash"), verifyPassword: () => counted(false), burnPasswordTime: () => counted(undefined) };
});
const { burnPasswordTime, hashPassword, verifyPassword } = await import("@/server/auth/password");

function held() {
  let finish!: () => void;
  const until = new Promise<void>((r) => (finish = r));
  let started = false;
  const run = withHashSlot(async () => {
    started = true;
    await until;
    return "done";
  });
  return { run, finish, started: () => started };
}

const tick = () => new Promise((r) => setTimeout(r, 5));

beforeEach(() => {
  core.inFlight = core.peak = core.calls = 0;
  resetSaturationForTests();
});
afterEach(() => configureHashGateForTests(null));

describe("password hashing on one server instance", () => {
  it("allows two in flight and waits about five seconds, as decision F10 asks", () => {
    expect(HASH_GATE_DEFAULTS).toMatchObject({ slots: 2, waitMs: 5_000 });
  });

  it("never runs more than two hash computations at once, whatever the callers", async () => {
    await Promise.all(Array.from({ length: 12 }, (_, i) => (i % 3 === 0 ? hashPassword("p") : i % 3 === 1 ? verifyPassword("p", "s") : burnPasswordTime("p"))));
    expect(core.calls).toBe(12);
    expect(core.peak).toBe(2);
    expect(hashGateState()).toMatchObject({ active: 0, waiting: 0 });
  });

  it("serves waiters in arrival order", async () => {
    configureHashGateForTests({ slots: 1 });
    const order: number[] = [];
    const first = held();
    const rest = [1, 2, 3].map((n) =>
      withHashSlot(async () => {
        order.push(n);
      }),
    );
    await tick();
    expect(hashGateState()).toMatchObject({ active: 1, waiting: 3 });
    first.finish();
    await Promise.all([first.run, ...rest]);
    expect(order).toEqual([1, 2, 3]);
  });

  it("refuses at once when the queue is full, as a busy error and not a wrong password", async () => {
    configureHashGateForTests({ slots: 1, queue: 1 });
    const [a, b] = [held(), held()];
    await tick();
    let started = false;
    const refused = withHashSlot(async () => {
      started = true;
    });
    await expect(refused).rejects.toSatisfy((err: unknown) => isHashBusy(err) && isDatabaseBusy(err));
    expect(started).toBe(false);
    a.finish();
    b.finish();
    await Promise.all([a.run, b.run]);
  });

  it("gives up after the bounded wait without taking a slot", async () => {
    configureHashGateForTests({ slots: 1, waitMs: 20 });
    const a = held();
    await tick();
    await expect(withHashSlot(async () => "never")).rejects.toSatisfy(isHashBusy);
    expect(hashGateState()).toMatchObject({ active: 1, waiting: 0 });
    a.finish();
    await a.run;
    expect(hashGateState()).toMatchObject({ active: 0, waiting: 0 });
  });

  it("frees the slot when the work fails", async () => {
    await expect(
      withHashSlot(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(hashGateState()).toMatchObject({ active: 0, waiting: 0 });
  });

  it("a holder's own hash does not wait for a second slot, even with the queue full", async () => {
    configureHashGateForTests({ slots: 1, queue: 0 });
    await expect(withHashSlot(() => hashPassword("p"))).resolves.toBe("hash");
    expect(core.calls).toBe(1);
    expect(hashGateState()).toMatchObject({ active: 0, waiting: 0 });
  });

  it("detached work left behind by a holder does not skip the line", async () => {
    configureHashGateForTests({ slots: 1, queue: 0 });
    let go!: () => void;
    const later = new Promise<void>((r) => (go = r));
    let detached!: Promise<unknown>;
    await withHashSlot(async () => {
      // then يحتفظ بسياق صاحب المكان، كما يفعل عمل أُطلق ولم يُنتظر
      detached = later.then(() => withHashSlot(async () => "x"));
    });
    const blocker = held();
    await tick();
    go();
    await expect(detached).rejects.toSatisfy(isHashBusy);
    blocker.finish();
    await blocker.run;
  });

  it("counts each refusal once for the owner, and only refusals", async () => {
    resetSaturationForTests({ holdWrites: true });
    configureHashGateForTests({ slots: 1, queue: 0 });
    await withHashSlot(async () => "served");
    expect(pendingSaturation().login_shed).toBeUndefined();
    const a = held();
    await tick();
    await expect(withHashSlot(async () => "x")).rejects.toSatisfy(isHashBusy);
    await expect(withHashSlot(async () => "x")).rejects.toSatisfy(isHashBusy);
    expect(pendingSaturation().login_shed).toBe(2);
    a.finish();
    await a.run;
  });
});

describe("no hash escapes the gate", () => {
  const root = join(process.cwd(), "src");
  const sources = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return sources(path);
      return /\.tsx?$/.test(name) ? [path] : [];
    });

  it("only the gated wrapper imports the hash functions from the raw core", () => {
    const offenders = sources(root).filter((file) => {
      if (relative(root, file).split(sep).join("/") === "server/auth/password.ts") return false;
      const text = readFileSync(file, "utf8");
      return [...text.matchAll(/import\s*\{([^}]*)\}\s*from\s*["'][^"']*password-core["']/g)].some((m) => /hashPassword|verifyPassword|burnPasswordTime/.test(m[1]));
    });
    expect(offenders).toEqual([]);
  });
});
