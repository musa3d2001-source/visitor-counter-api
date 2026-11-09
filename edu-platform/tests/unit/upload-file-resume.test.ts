import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ما يفعله المتصفح حين يضيع رد التأكيد أو يتعطل التخزين:
 * الملف وصل، فإعادة المحاولة تؤكده نفسه ولا ترفع نسخة ثانية بمفتاح جديد.
 */
const tus = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("@/lib/upload-retry", async (original) => ({ ...(await original<typeof import("@/lib/upload-retry")>()), retryDelayMs: () => 0 }));
vi.mock("@/lib/tus-upload", async (original) => ({ ...(await original<typeof import("@/lib/tus-upload")>()), runTusUpload: tus.run }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

const { uploadFile } = await import("@/components/admin/file-uploader");

type Posted = { url: string; body: Record<string, unknown> };
type Reply = () => Response | Promise<Response>;

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const lost: Reply = () => Promise.reject(new TypeError("Failed to fetch"));
const PUT_INIT = { key: "products/p/2026/11/a.pdf", method: "PUT", url: "https://storage.test/upload", headers: {} };
const TUS_INIT = { key: "video-1", method: "TUS", videoId: "video-1", endpoint: "https://tus.test", headers: {}, metadata: {} };

let posts: Posted[];
let puts: string[];
let initReplies: Reply[];
let completeReplies: Reply[];

class FakeXhr {
  status = 200;
  responseText = "";
  upload: { onprogress: unknown } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  open(_method: string, url: string) {
    puts.push(url);
  }
  setRequestHeader() {}
  abort() {}
  send() {
    queueMicrotask(() => this.onload?.());
  }
}

beforeEach(() => {
  posts = [];
  puts = [];
  initReplies = [() => json(200, PUT_INIT)];
  completeReplies = [() => json(200, { ok: true, message: "تم الحفظ" })];
  tus.run.mockReset();
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
  vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal("fetch", async (url: string, init: { body: string }) => {
    posts.push({ url, body: JSON.parse(init.body) });
    const queue = url.endsWith("/init") ? initReplies : completeReplies;
    const reply = queue.length > 1 ? queue.shift()! : queue[0];
    return reply();
  });
});
afterEach(() => vi.unstubAllGlobals());

const file = () => new File([new Uint8Array(32)], "ملف.pdf", { type: "application/pdf" });
const send = (resume?: Parameters<typeof uploadFile>[3], target: "main" | "lesson" = "main") => uploadFile(file(), { target, productId: "p" }, () => {}, resume);
const completes = () => posts.filter((p) => p.url.endsWith("/complete"));
const inits = () => posts.filter((p) => p.url.endsWith("/init"));

describe("تأكيد رفع PDF", () => {
  it("a confirmation whose answer was lost is sent again with the same key and uploads nothing twice", async () => {
    completeReplies = [lost, () => json(200, { ok: true, message: "تم الحفظ" })];
    await expect(send()).resolves.toEqual({ ok: true, message: "تم الحفظ" });
    expect(puts).toHaveLength(1);
    expect(completes().map((c) => c.body.key)).toEqual([PUT_INIT.key, PUT_INIT.key]);
  });

  it("a storage failure that outlasts the retries keeps the uploaded file for the next press", async () => {
    completeReplies = [() => json(503, { error: "تعذر الوصول إلى التخزين مؤقتًا. حاول مرة أخرى." })];
    const res = await send();
    expect(res).toEqual({ ok: false, error: "تعذر الوصول إلى التخزين مؤقتًا. حاول مرة أخرى.", canRetry: true, resume: { confirm: { key: PUT_INIT.key, method: "PUT" } } });
    expect(puts).toHaveLength(1);
    expect(completes()).toHaveLength(3);
  });

  it("the next press only confirms: no new upload and no new key", async () => {
    await expect(send({ confirm: { key: PUT_INIT.key, method: "PUT" } })).resolves.toMatchObject({ ok: true });
    expect(inits()).toHaveLength(0);
    expect(puts).toHaveLength(0);
    expect(completes().map((c) => c.body.key)).toEqual([PUT_INIT.key]);
  });

  it("a network that never comes back also keeps the file", async () => {
    completeReplies = [lost];
    await expect(send()).resolves.toMatchObject({ ok: false, canRetry: true, resume: { confirm: { key: PUT_INIT.key } } });
  });

  it("a 500 keeps the file too", async () => {
    completeReplies = [() => json(500, { error: "تعذر إكمال حفظ الملف. حاول مرة أخرى." })];
    await expect(send()).resolves.toMatchObject({ canRetry: true, resume: { confirm: { key: PUT_INIT.key } } });
    expect(completes()).toHaveLength(1);
  });

  it("storage saying the file never arrived starts a fresh upload on the next press", async () => {
    completeReplies = [() => json(409, { error: "لم يصل الملف" })];
    const res = await send();
    expect(res).toMatchObject({ ok: false, canRetry: true });
    expect(res).not.toHaveProperty("resume");
  });

  it("a refusal of the file itself offers no retry", async () => {
    completeReplies = [() => json(400, { error: "الملف محمي بكلمة مرور" })];
    const res = await send();
    expect(res).toEqual({ ok: false, error: "الملف محمي بكلمة مرور", canRetry: false });
    expect(completes()).toHaveLength(1);
  });
});

describe("رفع فيديو عبر TUS", () => {
  beforeEach(() => {
    initReplies = [() => json(200, TUS_INIT)];
  });

  it("an interrupted upload remembers its lesson, so the retry does not create another", async () => {
    tus.run.mockResolvedValueOnce({ ok: false, error: "انقطع" });
    const res = await send(undefined, "lesson");
    expect(res).toEqual({ ok: false, error: "انقطع", canRetry: true, resume: { videoId: "video-1" } });
    expect(inits()[0].body).not.toHaveProperty("resumeVideoId");

    tus.run.mockResolvedValueOnce({ ok: true });
    await expect(send({ videoId: "video-1" }, "lesson")).resolves.toMatchObject({ ok: true });
    expect(inits()[1].body.resumeVideoId).toBe("video-1");
    expect(completes().map((c) => c.body.key)).toEqual(["video-1"]);
  });

  it("preparing a lesson is never repeated by itself, because it creates a video at the provider", async () => {
    initReplies = [() => json(503, { error: "عطل" })];
    await expect(send(undefined, "lesson")).resolves.toMatchObject({ ok: false, canRetry: true });
    expect(inits()).toHaveLength(1);
    expect(tus.run).not.toHaveBeenCalled();
  });

  it("a failed preparation keeps pointing at the same lesson", async () => {
    initReplies = [() => json(503, { error: "عطل" })];
    await expect(send({ videoId: "video-1" }, "lesson")).resolves.toMatchObject({ canRetry: true, resume: { videoId: "video-1" } });
  });

  it("the size of a provider upload is not checked against the browser's number", async () => {
    tus.run.mockResolvedValueOnce({ ok: true });
    await send(undefined, "lesson");
    expect(completes()[0].body.size).toBeUndefined();
  });
});
