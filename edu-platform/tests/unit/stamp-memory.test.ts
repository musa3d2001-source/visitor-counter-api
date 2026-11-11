import { afterEach, describe, expect, it } from "vitest";
import { STAMP_TRANSFER_MEMORY_BYTES } from "@/lib/pdf-limits";
import { configureStampMemoryForTests, reserveStampMemory, stampMemoryState } from "@/server/access/stamp-memory";
import { assertStampCapacity, configureStampGateForTests, StampBusyError, stampGateContended, withStampSlot } from "@/server/access/stamp-gate";
import { pendingSaturation, resetSaturationForTests } from "@/server/platform/saturation";

/**
 * سقف البايتات خارج الختم (البندان R007 و R016): الأصل بعد قراءته، والنسخة حتى تُرفع، والنسخة التي تُبث من الذاكرة.
 * ما لا يتسع يُرد «مشغول» قبل أي قراءة، ولا ينتظر حتى تنفد ذاكرة النسخة.
 */
afterEach(() => {
  configureStampMemoryForTests(null);
  configureStampGateForTests(null);
});

const MB = 1024 * 1024;

describe("the transfer memory ceiling of one instance", () => {
  it("is 384 MB, which with two stampings and the server stays under 2 GB", () => {
    expect(STAMP_TRANSFER_MEMORY_BYTES).toBe(384 * MB);
    expect(stampMemoryState()).toEqual({ used: 0, budget: STAMP_TRANSFER_MEMORY_BYTES });
  });

  it("refuses busy, and notes the shed, once the bytes held would pass the ceiling", () => {
    configureStampMemoryForTests({ budgetBytes: 100 * MB });
    resetSaturationForTests({ holdWrites: true });
    const a = reserveStampMemory(60 * MB);
    expect(() => reserveStampMemory(50 * MB)).toThrow(StampBusyError);
    expect(pendingSaturation().stamp_shed).toBe(1);
    const b = reserveStampMemory(40 * MB);
    expect(stampMemoryState().used).toBe(100 * MB);
    a.release();
    b.release();
    expect(stampMemoryState().used).toBe(0);
  });

  it("always takes the first reservation on an idle instance, so one big file is never refused forever", () => {
    configureStampMemoryForTests({ budgetBytes: 10 * MB });
    const big = reserveStampMemory(50 * MB);
    expect(stampMemoryState().used).toBe(50 * MB);
    expect(() => reserveStampMemory(1)).toThrow(StampBusyError);
    big.release();
    expect(stampMemoryState().used).toBe(0);
  });

  it("follows the real size once it is known, and releases exactly once", () => {
    const lease = reserveStampMemory(10 * MB);
    lease.resize(25 * MB);
    expect(stampMemoryState().used).toBe(25 * MB);
    lease.resize(3 * MB);
    expect(stampMemoryState().used).toBe(3 * MB);
    lease.release();
    lease.release();
    lease.resize(99 * MB);
    expect(stampMemoryState().used).toBe(0);
  });
});

describe("the quick checks that keep background work off the students' slots", () => {
  it("assertStampCapacity refuses only when every slot and every queue place is taken", async () => {
    configureStampGateForTests({ slots: 1, queue: 1 });
    let finish!: () => void;
    const until = new Promise<void>((r) => (finish = r));
    const running = withStampSlot(() => until);
    expect(() => assertStampCapacity()).not.toThrow();
    expect(stampGateContended()).toBe(false);
    const queued = withStampSlot(async () => {});
    await new Promise((r) => setTimeout(r, 5));
    expect(stampGateContended()).toBe(true);
    expect(() => assertStampCapacity()).toThrow(StampBusyError);
    finish();
    await Promise.all([running, queued]);
    expect(stampGateContended()).toBe(false);
    expect(() => assertStampCapacity()).not.toThrow();
  });
});
