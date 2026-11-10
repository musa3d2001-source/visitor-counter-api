import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseBusyError } from "@/server/db-busy";
import { resetEnvCache } from "@/server/env";
import { TEST_ENV } from "../test-env";

const seen = vi.hoisted(() => ({ reported: [] as unknown[], afterCalls: [] as (() => unknown)[], afterThrows: false }));

vi.mock("@/server/platform/report-error", () => ({
  reportError: async (_source: string, err: unknown) => {
    seen.reported.push(err);
  },
}));
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: (fn: () => unknown) => {
    if (seen.afterThrows) throw new Error("outside a request");
    seen.afterCalls.push(fn);
  },
}));

const { invalidatePublicCache, publicCached, publicCacheStats, resetPublicCacheForTests } = await import("@/server/platform/public-cache");

const LIFETIME_S = 10;
const ms = (seconds: number) => seconds * 1000;
const advance = (seconds: number) => vi.advanceTimersByTime(ms(seconds));
const settle = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function counting<T>(value: T | (() => T)) {
  const loader = vi.fn(async () => (typeof value === "function" ? (value as () => T)() : value));
  return loader;
}

function useLifetime(seconds: string | undefined) {
  if (seconds === undefined) delete process.env.PUBLIC_CACHE_SECONDS;
  else process.env.PUBLIC_CACHE_SECONDS = seconds;
  resetEnvCache();
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["performance", "Date"] });
  useLifetime(String(LIFETIME_S));
  resetPublicCacheForTests();
  seen.reported.length = 0;
  seen.afterCalls.length = 0;
  seen.afterThrows = false;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

afterAll(() => {
  Object.assign(process.env, TEST_ENV);
  resetEnvCache();
});

describe("lifetime", () => {
  it("answers from memory while fresh, without touching the database", async () => {
    const loader = counting("v1");
    expect(await publicCached("k", loader)).toBe("v1");
    advance(LIFETIME_S / 2 - 0.1);
    expect(await publicCached("k", loader)).toBe("v1");
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("never serves a value past its lifetime, and reads the database instead", async () => {
    let value = "old";
    const loader = counting(() => value);
    await publicCached("k", loader);
    value = "new";
    advance(LIFETIME_S);
    expect(await publicCached("k", loader)).toBe("new");
  });

  it("never serves an expired value even when the database is failing: the error comes back instead", async () => {
    await publicCached("k", counting("old"));
    advance(LIFETIME_S + 1);
    await expect(publicCached("k", async () => Promise.reject(new DatabaseBusyError("queue")))).rejects.toBeInstanceOf(DatabaseBusyError);
  });

  it("counts the age from before the read started, so a slow read does not extend the guarantee", async () => {
    const gate = deferred<string>();
    const first = publicCached("k", () => gate.promise);
    advance(LIFETIME_S - 1);
    gate.resolve("read-at-start");
    await first;
    advance(1.5);
    const loader = counting("next");
    expect(await publicCached("k", loader)).toBe("next");
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("does not store anything at lifetime zero, which is how the test suites run", async () => {
    useLifetime("0");
    const loader = counting("v");
    await publicCached("k", loader);
    await publicCached("k", loader);
    expect(loader).toHaveBeenCalledTimes(2);
    expect(publicCacheStats().entries).toBe(0);
  });

  it("caps the lifetime at 55 seconds whatever the environment says: an unreadable or larger value is the default, not a longer stay", async () => {
    useLifetime("600");
    const loader = counting("v");
    await publicCached("k", loader);
    advance(55);
    await publicCached("k", loader);
    expect(loader).toHaveBeenCalledTimes(2);
  });
});

describe("stale while revalidate", () => {
  it("answers immediately after half the lifetime and refreshes once in the background", async () => {
    const gate = deferred<string>();
    const loader = vi.fn(() => gate.promise);
    await publicCached("k", async () => "old");
    advance(LIFETIME_S / 2);
    expect(await publicCached("k", loader)).toBe("old");
    expect(await publicCached("k", loader)).toBe("old");
    expect(loader).toHaveBeenCalledTimes(1);
    gate.resolve("new");
    await settle();
    expect(await publicCached("k", loader)).toBe("new");
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("keeps the instance alive for the refresh with after()", async () => {
    await publicCached("k", async () => "old");
    advance(LIFETIME_S / 2);
    await publicCached("k", async () => "new");
    expect(seen.afterCalls).toHaveLength(1);
    await expect(seen.afterCalls[0]()).resolves.toBeUndefined();
  });

  it("still refreshes outside a request, where after() throws", async () => {
    seen.afterThrows = true;
    await publicCached("k", async () => "old");
    advance(LIFETIME_S / 2);
    await publicCached("k", async () => "new");
    await settle();
    expect(await publicCached("k", async () => "unused")).toBe("new");
  });

  it("a failed refresh leaves the value in place until its lifetime ends and tells the owner", async () => {
    await publicCached("k", async () => "old");
    advance(LIFETIME_S / 2);
    const boom = new Error("boom");
    expect(await publicCached("k", async () => Promise.reject(boom))).toBe("old");
    await settle();
    expect(seen.reported).toEqual([boom]);
    expect(await publicCached("k", async () => Promise.reject(boom))).toBe("old");
  });

  it("a refresh refused because the database is busy is not an incident", async () => {
    await publicCached("k", async () => "old");
    advance(LIFETIME_S / 2);
    await publicCached("k", async () => Promise.reject(new DatabaseBusyError("queue")));
    await settle();
    expect(seen.reported).toEqual([]);
  });

  it("runs at most two background refreshes at once per instance", async () => {
    for (const key of ["a", "b", "c", "d"]) await publicCached(key, async () => "old");
    advance(LIFETIME_S / 2);
    const gates = [deferred<string>(), deferred<string>()];
    const loaders = [vi.fn(() => gates[0].promise), vi.fn(() => gates[1].promise), vi.fn(async () => "x"), vi.fn(async () => "y")];
    await Promise.all(["a", "b", "c", "d"].map((key, i) => publicCached(key, loaders[i])));
    expect(loaders[0]).toHaveBeenCalledTimes(1);
    expect(loaders[1]).toHaveBeenCalledTimes(1);
    expect(loaders[2]).not.toHaveBeenCalled();
    expect(loaders[3]).not.toHaveBeenCalled();
    gates[0].resolve("a2");
    gates[1].resolve("b2");
    await settle();
    await publicCached("c", loaders[2]);
    expect(loaders[2]).toHaveBeenCalledTimes(1);
  });
});

describe("single flight", () => {
  it("many simultaneous visitors cost one read", async () => {
    const gate = deferred<string>();
    const loader = vi.fn(() => gate.promise);
    const all = Array.from({ length: 50 }, () => publicCached("k", loader));
    expect(loader).toHaveBeenCalledTimes(1);
    gate.resolve("v");
    expect(new Set(await Promise.all(all))).toEqual(new Set(["v"]));
  });

  it("gives every waiter the database error, then the next visitor starts a new read", async () => {
    const gate = deferred<string>();
    const waiting = [publicCached("k", () => gate.promise), publicCached("k", () => gate.promise)];
    gate.reject(new Error("down"));
    await expect(Promise.all(waiting)).rejects.toThrow("down");
    expect(await publicCached("k", async () => "recovered")).toBe("recovered");
  });

  it("stops waiting behind a read that has hung for longer than the database deadlines", async () => {
    const hung = publicCached("k", () => new Promise<string>(() => undefined));
    void hung;
    advance(16);
    const loader = counting("fresh");
    expect(await publicCached("k", loader)).toBe("fresh");
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("when two reads overlap, the one that started later wins", async () => {
    const slow = deferred<string>();
    const hung = publicCached("k", () => slow.promise);
    advance(16);
    await publicCached("k", async () => "newer");
    slow.resolve("older");
    await hung;
    expect(await publicCached("k", async () => "unused")).toBe("newer");
  });
});

describe("invalidation", () => {
  it("drops everything held", async () => {
    await publicCached("k", async () => "old");
    invalidatePublicCache();
    expect(publicCacheStats()).toMatchObject({ entries: 0, totalChars: 0 });
    expect(await publicCached("k", async () => "new")).toBe("new");
  });

  it("a read that started before the owner's change is neither stored nor joined", async () => {
    const gate = deferred<string>();
    const before = publicCached("k", () => gate.promise);
    invalidatePublicCache();
    const after = counting("after-change");
    expect(await publicCached("k", after)).toBe("after-change");
    expect(after).toHaveBeenCalledTimes(1);
    gate.resolve("before-change");
    await before;
    expect(await publicCached("k", async () => "unused")).toBe("after-change");
  });

  it("never throws", () => {
    const original = Map.prototype.clear;
    vi.spyOn(Map.prototype, "clear").mockImplementation(function (this: Map<unknown, unknown>) {
      original.call(this);
      throw new Error("bad");
    });
    expect(() => invalidatePublicCache()).not.toThrow();
  });
});

describe("bounds", () => {
  it("holds at most 1000 entries and drops the least recently used", async () => {
    await publicCached("keep", async () => 1);
    for (let i = 0; i < 1100; i++) {
      await publicCached(`k${i}`, async () => i);
      if (i % 100 === 0) await publicCached("keep", async () => -1);
    }
    expect(publicCacheStats().entries).toBe(1000);
    expect(await publicCached("keep", async () => -1)).toBe(1);
    const loader = counting(99);
    await publicCached("k0", loader);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("does not store one oversized value, and still returns it", async () => {
    const huge = "x".repeat(2_000_001);
    expect(await publicCached("k", async () => huge)).toBe(huge);
    expect(publicCacheStats()).toMatchObject({ entries: 0, totalChars: 0, notStored: 1 });
  });

  it("keeps the total size under the bound", async () => {
    const big = "x".repeat(1_000_000);
    for (let i = 0; i < 20; i++) await publicCached(`k${i}`, async () => big + i);
    const { entries, totalChars } = publicCacheStats();
    expect(totalChars).toBeLessThanOrEqual(12_000_000);
    expect(entries).toBeLessThan(20);
  });

  it("does not store what the caller excludes, such as not-found for a random link", async () => {
    const loader = counting(null);
    await publicCached("k", loader, { skipStore: (v) => v === null });
    await publicCached("k", loader, { skipStore: (v) => v === null });
    expect(loader).toHaveBeenCalledTimes(2);
  });
});

describe("isolation between requests", () => {
  for (const lifetime of ["10", "0"]) {
    it(`deep-freezes what it hands out (lifetime ${lifetime})`, async () => {
      useLifetime(lifetime);
      const value = await publicCached("k", async () => [{ title: "a", nested: { price: 1 }, list: [{ x: 1 }] }]);
      expect(() => value.push({ title: "b", nested: { price: 2 }, list: [] })).toThrow(TypeError);
      expect(() => {
        value[0].title = "changed";
      }).toThrow(TypeError);
      expect(() => {
        value[0].nested.price = 999;
      }).toThrow(TypeError);
      expect(() => {
        value[0].list[0].x = 999;
      }).toThrow(TypeError);
    });
  }
});

describe("a failure of the cache itself falls back to the database", () => {
  it("when the store cannot be read", async () => {
    await publicCached("k", async () => "stored");
    vi.spyOn(Map.prototype, "get").mockImplementation(() => {
      throw new Error("corrupt");
    });
    const loader = counting("from-db");
    expect(await publicCached("k", loader)).toBe("from-db");
    expect(loader).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
    expect(publicCacheStats().internalFailures).toBe(1);
  });

  it("when a value cannot be measured", async () => {
    const loader = counting(() => ({ total: 1n }));
    expect((await publicCached("k", loader)).total).toBe(1n);
    expect(publicCacheStats()).toMatchObject({ entries: 0, notStored: 1 });
  });

  it("when a value cannot be frozen", async () => {
    const bytes = new Uint8Array(4);
    expect(await publicCached("k", async () => bytes)).toBe(bytes);
    expect(publicCacheStats().entries).toBe(0);
  });

  it("does not retry a failed database read, which would double the load on a struggling database", async () => {
    const loader = vi.fn(async () => Promise.reject(new DatabaseBusyError("queue")));
    await expect(publicCached("k", loader)).rejects.toBeInstanceOf(DatabaseBusyError);
    expect(loader).toHaveBeenCalledTimes(1);
  });
});
