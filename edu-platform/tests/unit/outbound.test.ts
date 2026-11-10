import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { boundedFetch, fetchText, isStorageDownload, isStorageUpload, OutboundError, STORAGE_LIMITS, storageFetch } from "@/server/outbound";
import { MyFatoorahClient, MyFatoorahError } from "@/server/payments/myfatoorah";
import { bunnyLimits, BunnyError, getVideo } from "@/server/video/bunny";
import { resetSupabaseClientForTests, supabaseDriver } from "@/server/storage/supabase";
import { resetEnvCache } from "@/server/env";

/**
 * خادم محلي يتصرف كمزود متعثر: يرسل الترويسات ثم يتوقف، أو لا يرد أبدًا، أو يرسل أكثر من الحد، أو يحول.
 * المطلوب في كل حالة: خطأ سريع ضمن المهلة، لا طلب معلق.
 */
let server: Server;
let base = "";
const open = new Set<ServerResponse>();
const hits: string[] = [];

function handler(req: IncomingMessage, res: ServerResponse) {
  open.add(res);
  res.on("close", () => open.delete(res));
  const path = new URL(req.url ?? "/", "http://x").pathname;
  hits.push(`${req.method} ${path}`);
  if (path.endsWith("/ok")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  // تنزيل كائن، أو قراءة الرابط الموقّع (GET على sign/)، أو Bunny، أو حالة الدفع: ترويسات ثم صمت
  if (path.endsWith("/stall-body") || (req.method === "GET" && /\/storage\/v1\/object\/(?!info\/)/.test(path)) || /\/library\/[^/]+\/videos\//.test(path) || path.endsWith("/v2/GetPaymentStatus")) {
    // ترويسات ثم أول جزء ثم صمت
    res.writeHead(200, { "content-type": "application/json" });
    res.write("{");
    return;
  }
  if (path.endsWith("/stall-headers")) return;
  if (path.startsWith("/storage/v1/object/info/")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.write('{"size":');
    return;
  }
  if (req.method === "POST" && path.startsWith("/storage/v1/object/sign/")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ signedURL: `/object/sign/private-content/head-stall?token=t` }));
    return;
  }
  if (path.endsWith("/big-chunked")) {
    res.writeHead(200, { "content-type": "application/octet-stream" });
    const chunk = Buffer.alloc(4096, 97);
    for (let i = 0; i < 8; i++) res.write(chunk);
    res.end();
    return;
  }
  if (path.endsWith("/big-declared")) {
    res.writeHead(200, { "content-type": "application/octet-stream", "content-length": String(10 * 1024 * 1024) });
    res.write(Buffer.alloc(10));
    return;
  }
  if (path.endsWith("/redirect")) {
    res.writeHead(302, { location: `${base}/ok` });
    res.end();
    return;
  }
  if (path.endsWith("/drip")) {
    // بايت كل 50 مللي ثانية: لا توقف، لكن الرد لا ينتهي
    res.writeHead(200, { "content-type": "text/plain" });
    const t = setInterval(() => res.write("."), 50);
    res.on("close", () => clearInterval(t));
    return;
  }
  res.writeHead(404);
  res.end();
}

beforeAll(async () => {
  server = createServer(handler);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  for (const r of open) r.destroy();
  await new Promise<void>((r) => server.close(() => r()));
});

async function failure(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (err) {
    return err;
  }
  throw new Error("expected a failure");
}

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const t = Date.now();
  const value = await fn();
  return { value, ms: Date.now() - t };
}

describe("boundedFetch", () => {
  it("reads a normal response", async () => {
    const r = await fetchText(`${base}/ok`, undefined, { timeoutMs: 1000, maxBytes: 1024 });
    expect(r.status).toBe(200);
    expect(JSON.parse(r.text)).toEqual({ ok: true });
  });

  it("ends a response whose body stalls after the headers within the one deadline", async () => {
    const { value: err, ms } = await timed(() => failure(fetchText(`${base}/stall-body`, undefined, { timeoutMs: 300, maxBytes: 1024 })));
    expect(err).toBeInstanceOf(OutboundError);
    expect((err as OutboundError).kind).toBe("timeout");
    expect(ms).toBeLessThan(2000);
  });

  it("ends a request whose headers never arrive", async () => {
    const err = await failure(fetchText(`${base}/stall-headers`, undefined, { timeoutMs: 300, maxBytes: 1024 }));
    expect((err as OutboundError).kind).toBe("timeout");
  });

  it("ends a body that keeps trickling past the deadline", async () => {
    const err = await failure(fetchText(`${base}/drip`, undefined, { timeoutMs: 300, maxBytes: 1024 * 1024 }));
    expect((err as OutboundError).kind).toBe("timeout");
  });

  it("refuses a body larger than the cap, with or without Content-Length", async () => {
    const chunked = await failure(fetchText(`${base}/big-chunked`, undefined, { timeoutMs: 2000, maxBytes: 10_000 }));
    expect((chunked as OutboundError).kind).toBe("too_large");
    const declared = await failure(fetchText(`${base}/big-declared`, undefined, { timeoutMs: 2000, maxBytes: 10_000 }));
    expect((declared as OutboundError).kind).toBe("too_large");
  });

  it("reads only the first bytes when asked to truncate", async () => {
    const res = await boundedFetch(`${base}/big-chunked`, undefined, { timeoutMs: 2000, maxBytes: 5000, truncate: true });
    expect((await res.arrayBuffer()).byteLength).toBe(5000);
  });

  it("does not follow redirects unless asked", async () => {
    hits.length = 0;
    const err = await failure(fetchText(`${base}/redirect`, undefined, { timeoutMs: 1000, maxBytes: 1024 }));
    expect((err as OutboundError).kind).toBe("redirect");
    expect(hits).toEqual(["GET /redirect"]);
    const followed = await fetchText(`${base}/redirect`, undefined, { timeoutMs: 1000, maxBytes: 1024, followRedirects: true });
    expect(followed.status).toBe(200);
  });

  it("cuts a long download that stops sending bytes, with no overall deadline", async () => {
    const err = await failure(fetchText(`${base}/stall-body`, undefined, { timeoutMs: 0, idleMs: 300, maxBytes: 1024 }));
    expect((err as OutboundError).kind).toBe("stalled");
  });

  it("names a network failure without the URL or headers", async () => {
    const err = (await failure(fetchText("http://127.0.0.1:1/x?token=secret-token", { headers: { authorization: "Bearer secret-key" } }, { timeoutMs: 1000, maxBytes: 10 }))) as OutboundError;
    expect(err.kind).toBe("network");
    expect(err.message).not.toContain("secret");
  });

  it("classifies Supabase Storage requests", () => {
    const u = "https://p.supabase.co/storage/v1/object";
    expect(isStorageDownload("GET", `${u}/private-content/a/b.pdf`)).toBe(true);
    expect(isStorageDownload("GET", `${u}/info/private-content/a.pdf`)).toBe(false);
    expect(isStorageDownload("POST", `${u}/sign/private-content/a.pdf`)).toBe(false);
    expect(isStorageUpload("POST", `${u}/private-content/a.pdf`)).toBe(true);
    expect(isStorageUpload("POST", `${u}/sign/private-content/a.pdf`)).toBe(false);
    expect(isStorageUpload("POST", `${u}/move`)).toBe(false);
  });
});

describe("clients on a stalled provider", () => {
  const saved = { ...STORAGE_LIMITS };
  const savedBunny = { ...bunnyLimits };
  const envNames = ["STORAGE_DRIVER", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_PRIVATE_BUCKET", "BUNNY_STREAM_LIBRARY_ID", "BUNNY_STREAM_API_KEY", "BUNNY_STREAM_TOKEN_KEY", "BUNNY_STREAM_API_BASE"];
  const savedEnv = Object.fromEntries(envNames.map((k) => [k, process.env[k]]));

  afterEach(() => {
    Object.assign(STORAGE_LIMITS, saved);
    Object.assign(bunnyLimits, savedBunny);
    for (const k of envNames) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
    resetEnvCache();
    resetSupabaseClientForTests();
  });

  it("MyFatoorah: a body that stalls ends as an unknown outcome (no status), not a hang", async () => {
    const client = new MyFatoorahClient({ baseUrl: base, apiKey: "k", timeoutMs: 300 });
    const { value: err, ms } = await timed(() => failure(client.getPaymentStatus("1", "InvoiceId")));
    expect(err).toBeInstanceOf(MyFatoorahError);
    expect((err as MyFatoorahError).status).toBeUndefined();
    expect(ms).toBeLessThan(2000);
  });

  it("Bunny: a body that stalls ends as a BunnyError", async () => {
    Object.assign(process.env, { BUNNY_STREAM_LIBRARY_ID: "1", BUNNY_STREAM_API_KEY: "k", BUNNY_STREAM_TOKEN_KEY: "t", BUNNY_STREAM_API_BASE: base });
    resetEnvCache();
    bunnyLimits.timeoutMs = 300;
    const { value: err, ms } = await timed(() => failure(getVideo("6f1c2b8e-0d2f-4b7a-9a51-1c7e3b2d4f60")));
    expect(err).toBeInstanceOf(BunnyError);
    expect(ms).toBeLessThan(2000);
  });

  it("Supabase Storage: a stalled download, info call and head read all end", async () => {
    Object.assign(process.env, { STORAGE_DRIVER: "supabase", SUPABASE_URL: base, SUPABASE_SERVICE_ROLE_KEY: "service-key", SUPABASE_PRIVATE_BUCKET: "private-content" });
    resetEnvCache();
    resetSupabaseClientForTests();
    Object.assign(STORAGE_LIMITS, { controlMs: 300, transferMs: 600, idleMs: 300 });
    const read = await timed(() => failure(supabaseDriver.read("private", "a/file.pdf")));
    expect(read.ms).toBeLessThan(2500);
    expect(String(read.value)).toMatch(/storage download failed|انتهت|توقف/);
    const stat = await timed(() => failure(supabaseDriver.stat("private", "a/file.pdf")));
    expect(stat.ms).toBeLessThan(2500);
    const head = await timed(() => failure(supabaseDriver.readHead("private", "a/file.pdf", 1024)));
    expect(head.ms).toBeLessThan(2500);
    expect(String(head.value)).toMatch(/انتهت/);
    expect(hits).toContain("GET /storage/v1/object/sign/private-content/head-stall");
  });

  it("storageFetch gives control calls the short deadline and downloads the transfer deadline", async () => {
    const f = storageFetch({ controlMs: 200, transferMs: 5000, idleMs: 0, maxDownloadBytes: 1024 });
    const control = await timed(() => failure(f(`${base}/storage/v1/object/info/private-content/x`).then((r) => r.text())));
    expect((control.value as OutboundError).kind).toBe("timeout");
    expect(control.ms).toBeLessThan(1500);
  });
});
