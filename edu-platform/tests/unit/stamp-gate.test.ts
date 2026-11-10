import { afterEach, describe, expect, it } from "vitest";
import { configureStampGateForTests, STAMP_GATE_DEFAULTS, StampBusyError, stampGateState, withStampSlot } from "@/server/access/stamp-gate";

function held() {
  let finish!: () => void;
  const until = new Promise<void>((r) => (finish = r));
  let started = false;
  const run = withStampSlot(async () => {
    started = true;
    await until;
    return "done";
  });
  return { run, finish, started: () => started };
}

const tick = () => new Promise((r) => setTimeout(r, 5));

afterEach(() => configureStampGateForTests(null));

describe("حد أعمال PDF على نسخة الخادم", () => {
  it("runs at most two at once, as the memory derivation assumes", () => {
    expect(STAMP_GATE_DEFAULTS.slots).toBe(2);
  });

  it("a third job waits until a slot is free, and then runs", async () => {
    const [a, b, c] = [held(), held(), held()];
    await tick();
    expect([a.started(), b.started(), c.started()]).toEqual([true, true, false]);
    expect(stampGateState()).toMatchObject({ active: 2, waiting: 1 });
    a.finish();
    await a.run;
    await tick();
    expect(c.started()).toBe(true);
    b.finish();
    c.finish();
    await Promise.all([b.run, c.run]);
    expect(stampGateState()).toMatchObject({ active: 0, waiting: 0 });
  });

  it("a full queue is refused at once with a retry hint", async () => {
    configureStampGateForTests({ queue: 1, retryAfterSeconds: 7 });
    const [a, b, c] = [held(), held(), held()];
    const refused = withStampSlot(async () => "never");
    await expect(refused).rejects.toBeInstanceOf(StampBusyError);
    await expect(refused).rejects.toMatchObject({ retryAfterSeconds: 7 });
    for (const j of [a, b, c]) j.finish();
    await Promise.all([a.run, b.run, c.run]);
  });

  it("a job that waited too long gives up without taking a slot", async () => {
    configureStampGateForTests({ waitMs: 15 });
    const [a, b] = [held(), held()];
    await expect(withStampSlot(async () => "never")).rejects.toBeInstanceOf(StampBusyError);
    expect(stampGateState()).toMatchObject({ active: 2, waiting: 0 });
    a.finish();
    b.finish();
    await Promise.all([a.run, b.run]);
    expect(stampGateState().active).toBe(0);
  });

  it("a job that throws gives its slot back", async () => {
    await expect(
      withStampSlot(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(stampGateState().active).toBe(0);
  });

  it("a slot passes to the first in line, not to a job that just arrived", async () => {
    configureStampGateForTests({ slots: 1 });
    const order: string[] = [];
    const a = held();
    const queued = withStampSlot(async () => void order.push("queued"));
    a.finish();
    await a.run;
    await withStampSlot(async () => void order.push("late"));
    await queued;
    expect(order).toEqual(["queued", "late"]);
  });
});
