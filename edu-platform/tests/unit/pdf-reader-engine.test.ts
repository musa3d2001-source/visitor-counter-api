import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

/** خيط وهمي نتحكم في أحداثه: المهلة والانهيار لا يمكن إنتاجهما بملف صغير */
const created = vi.hoisted(() => ({ workers: [] as Array<EventEmitter & { terminate: () => Promise<number> }>, refuse: false }));

vi.mock("node:worker_threads", async () => {
  const { EventEmitter: Emitter } = await import("node:events");
  class FakeWorker extends Emitter {
    terminate = vi.fn(async () => 0);
    constructor() {
      super();
      if (created.refuse) throw new Error("no threads here");
      created.workers.push(this);
    }
  }
  return { Worker: FakeWorker, default: { Worker: FakeWorker } };
});

const { openInReader, READER_BUDGET_MS } = await import("@/server/access/pdf-reader-engine");

const start = () => {
  const verdict = openInReader(new Uint8Array([1, 2, 3]));
  return { verdict, worker: created.workers.at(-1)! };
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  created.workers.length = 0;
  created.refuse = false;
});

describe("حدود خيط القارئ", () => {
  it("stops the thread at the deadline and calls the file too complex", async () => {
    vi.useFakeTimers();
    const { verdict, worker } = start();
    await vi.advanceTimersByTimeAsync(READER_BUDGET_MS);
    await expect(verdict).resolves.toEqual({ status: "failed", problem: "too_complex" });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("a file that exhausts the thread's memory is too complex for a phone as well", async () => {
    const { verdict, worker } = start();
    worker.emit("error", Object.assign(new Error("oom"), { code: "ERR_WORKER_OUT_OF_MEMORY" }));
    await expect(verdict).resolves.toEqual({ status: "failed", problem: "too_complex" });
  });

  it("a crash of the engine does not condemn the file", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { verdict, worker } = start();
    worker.emit("error", new Error("boom"));
    await expect(verdict).resolves.toEqual({ status: "unavailable" });
  });

  it("a thread that ends without an answer gives no verdict", async () => {
    const { verdict, worker } = start();
    worker.emit("exit", 1);
    await expect(verdict).resolves.toEqual({ status: "unavailable" });
  });

  it("a host that cannot start threads gives no verdict and uploads keep working", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    created.refuse = true;
    await expect(openInReader(new Uint8Array([1]))).resolves.toEqual({ status: "unavailable" });
  });

  it("passes the answer through and always frees the thread", async () => {
    const { verdict, worker } = start();
    worker.emit("message", { status: "ok", pages: 4, encrypted: false });
    await expect(verdict).resolves.toEqual({ status: "ok", pages: 4, encrypted: false });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("a later event cannot change the verdict", async () => {
    const { verdict, worker } = start();
    worker.emit("message", { status: "failed", problem: "encrypted" });
    worker.emit("exit", 0);
    await expect(verdict).resolves.toEqual({ status: "failed", problem: "encrypted" });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
});
