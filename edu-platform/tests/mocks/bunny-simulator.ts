/**
 * ============================================================================
 *  محاكي Bunny Stream — بديل اختبار فقط (TEST DOUBLE). لا يُستخدم في الإنتاج أبدًا.
 * ============================================================================
 *
 * لماذا؟ بيئة التطوير لا تستطيع الوصول إلى video.bunnycdn.com و iframe.mediadelivery.net
 * (الشبكة مقيدة)، لذلك نختبر مسار الفيديو كاملًا (إنشاء ← رفع TUS ← معالجة ← Webhook ← تضمين موقّع)
 * مقابل محاكٍ محلي مبني فقط على الحقائق الموثقة من وثائق Bunny ومكتبة bunnycdn-stream:
 *   - API:  {base}/library/{libraryId}/videos  مع ترويسة AccessKey
 *           كائن الفيديو: {guid, videoLibraryId, title, status, length, encodeProgress,
 *           availableResolutions, thumbnailFileName, width, height, storageSize}
 *           الحالات: 0 Created، 1 Uploaded، 2 Processing، 3 Transcoding، 4 Finished، 5 Error، 6 UploadFailed
 *   - TUS:  {base}/tusupload — ترويسات AuthorizationSignature = SHA256_HEX(libraryId + apiKey + expire + videoId)
 *           و AuthorizationExpire (ثوانٍ، يُتحقق منه في كل طلب POST/HEAD/PATCH) و VideoId و LibraryId
 *   - تضمين: /embed/{libraryId}/{videoId}?token=SHA256_HEX(tokenKey + videoId + expires)&expires=…
 *           (403 إن كان الرمز خاطئًا أو منتهيًا) — والمشغل يستجيب لبروتوكول player.js
 *   - Webhook (bunny.net/docs/stream-webhook): POST {IsLiveStreamWebhook:false, VideoLibraryId, VideoGuid, Status, EventId, Timestamp}
 *           Status 3 = Finished، و EventId ثابت عند إعادة الإرسال
 *           X-BunnyStream-Signature = HEX(HMAC-SHA256(rawBody, readOnlyKey))
 *           + X-BunnyStream-Signature-Version: v1 + X-BunnyStream-Signature-Algorithm: hmac-sha256
 *
 * التطبيق يُوجَّه إليه فقط في الاختبارات عبر BUNNY_STREAM_API_BASE / BUNNY_STREAM_TUS_ENDPOINT /
 * BUNNY_STREAM_EMBED_BASE. قبل الإطلاق يجب اختبار التكامل مقابل مكتبة Bunny Stream حقيقية.
 */
import { createHash, createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import { mp4DurationSeconds } from "../../src/server/video/mp4";

export type BunnySimOptions = {
  port?: number;
  host?: string;
  libraryId?: string;
  apiKey?: string;
  tokenKey?: string;
  readOnlyKey?: string;
  /** وجهة Webhook (اختياري) */
  webhookUrl?: string;
  /** إرسال كل webhook مرتين (لاختبار منع التكرار) */
  duplicateWebhooks?: boolean;
  /** زمن المعالجة بعد اكتمال الرفع (افتراضي 300ms) */
  processingDelayMs?: number;
  /** المدة الافتراضية إن تعذّر قراءتها من الملف */
  defaultLengthSeconds?: number;
};

export type SimVideo = {
  guid: string;
  videoLibraryId: number;
  title: string;
  dateUploaded: string;
  status: number;
  length: number;
  encodeProgress: number;
  availableResolutions: string | null;
  thumbnailFileName: string | null;
  width: number;
  height: number;
  storageSize: number;
  bytes: Buffer | null;
};

type TusUpload = { id: string; guid: string; length: number; offset: number; chunks: Buffer[]; metadata: Record<string, string>; expire: number };

export type BunnyWebhookDelivery = { guid: string; status: number; httpStatus: number | null; body: string; error?: string };

export type BunnySimState = {
  videos: Map<string, SimVideo>;
  uploads: Map<string, TusUpload>;
  requests: { method: string; path: string; status: number }[];
  webhookDeliveries: BunnyWebhookDelivery[];
};

export type BunnySimulator = {
  url: string;
  libraryId: string;
  apiKey: string;
  tokenKey: string;
  readOnlyKey: string;
  state: BunnySimState;
  /** يغيّر حالة فيديو يدويًا (للاختبارات) */
  setStatus(guid: string, status: number, length?: number): void;
  /** الرفع المكتمل التالي يفشل في المعالجة (status 5) */
  failNext(): void;
  /** يرسل webhook موقّعًا يدويًا */
  sendWebhook(guid: string, status: number, opts?: { secret?: string }): Promise<number | null>;
  /** بناء جسم webhook وتوقيعه (للاختبارات المباشرة) */
  buildWebhook(guid: string, status: number, secret?: string): { body: string; signature: string };
  /** رابط تضمين موقّع كما يولده الخادم */
  signEmbed(guid: string, expires: number): string;
  close(): Promise<void>;
};

const TUS_HEADERS = {
  "Tus-Resumable": "1.0.0",
  "Tus-Version": "1.0.0",
  "Tus-Extension": "creation,creation-with-upload,termination",
};

const CORS_ALLOW_HEADERS = [
  "Authorization",
  "Content-Type",
  "Location",
  "Tus-Extension",
  "Tus-Max-Size",
  "Tus-Resumable",
  "Tus-Version",
  "Upload-Concat",
  "Upload-Defer-Length",
  "Upload-Length",
  "Upload-Metadata",
  "Upload-Offset",
  "X-HTTP-Method-Override",
  "X-Requested-With",
  "AuthorizationSignature",
  "AuthorizationExpire",
  "VideoId",
  "LibraryId",
].join(", ");

function sha256Hex(s: string) {
  return createHash("sha256").update(s).digest("hex");
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolveBody(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function parseMetadata(h: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!h) return out;
  for (const pair of h.split(",")) {
    const [k, v] = pair.trim().split(" ");
    if (k) out[k] = v ? Buffer.from(v, "base64").toString("utf8") : "";
  }
  return out;
}

let playerJsSource: string | null = null;
function playerJs(): string {
  if (playerJsSource === null) {
    try {
      playerJsSource = readFileSync(resolve(__dirname, "../../node_modules/player.js/dist/player-0.1.0.min.js"), "utf8");
    } catch {
      playerJsSource = "";
    }
  }
  return playerJsSource;
}

export async function startBunnySimulator(opts: BunnySimOptions = {}): Promise<BunnySimulator> {
  const libraryId = opts.libraryId ?? "424242";
  const apiKey = opts.apiKey ?? "bunny-sim-api-key";
  const tokenKey = opts.tokenKey ?? "bunny-sim-token-key";
  const readOnlyKey = opts.readOnlyKey ?? "bunny-sim-readonly-key";
  const delay = opts.processingDelayMs ?? 300;
  const state: BunnySimState = { videos: new Map(), uploads: new Map(), requests: [], webhookDeliveries: [] };
  let failNextUpload = false;
  let baseUrl = "";
  const timers = new Set<NodeJS.Timeout>();

  const later = (ms: number, fn: () => void) => {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
  };

  const publicVideo = (v: SimVideo) => {
    const { bytes: _bytes, ...rest } = v;
    void _bytes;
    return rest;
  };

  /** الحدث الواحد يحتفظ بمعرفه ووقته عند إعادة الإرسال، كما في الوثائق */
  const webhookEvents = new Map<string, { eventId: string; timestamp: string }>();

  const buildWebhook = (guid: string, status: number, secret = readOnlyKey) => {
    const key = `${guid}:${status}`;
    const event = webhookEvents.get(key) ?? { eventId: randomUUID(), timestamp: new Date().toISOString() };
    webhookEvents.set(key, event);
    const body = JSON.stringify({ IsLiveStreamWebhook: false, VideoLibraryId: Number(libraryId), VideoGuid: guid, Status: status, EventId: event.eventId, Timestamp: event.timestamp });
    const signature = createHmac("sha256", secret).update(body, "utf8").digest("hex");
    return { body, signature };
  };

  const sendWebhook = async (guid: string, status: number, o: { secret?: string } = {}): Promise<number | null> => {
    if (!opts.webhookUrl) return null;
    const { body, signature } = buildWebhook(guid, status, o.secret);
    const times = opts.duplicateWebhooks ? 2 : 1;
    let last: number | null = null;
    for (let i = 0; i < times; i++) {
      try {
        const res = await fetch(opts.webhookUrl, {
          method: "POST",
          headers: { "content-type": "application/json", "X-BunnyStream-Signature": signature, "X-BunnyStream-Signature-Version": "v1", "X-BunnyStream-Signature-Algorithm": "hmac-sha256" },
          body,
        });
        last = res.status;
        state.webhookDeliveries.push({ guid, status, httpStatus: res.status, body });
      } catch (err) {
        state.webhookDeliveries.push({ guid, status, httpStatus: null, body, error: String(err) });
      }
    }
    return last;
  };

  const onUploadComplete = (upload: TusUpload) => {
    const v = state.videos.get(upload.guid);
    if (!v) return;
    const bytes = Buffer.concat(upload.chunks);
    v.bytes = bytes;
    v.storageSize = bytes.length;
    v.status = 1; // Uploaded
    const shouldFail = failNextUpload;
    failNextUpload = false;
    later(Math.floor(delay / 2), () => {
      if (shouldFail) return;
      v.status = 3; // Transcoding
      v.encodeProgress = 50;
    });
    later(delay, () => {
      if (shouldFail) {
        v.status = 5; // Error
        void sendWebhook(v.guid, 5);
        return;
      }
      const parsed = mp4DurationSeconds(new Uint8Array(bytes));
      v.length = parsed ?? opts.defaultLengthSeconds ?? 42;
      v.status = 4; // Finished
      v.encodeProgress = 100;
      v.width = 320;
      v.height = 240;
      v.availableResolutions = "240p";
      v.thumbnailFileName = "thumbnail.jpg";
      // حالة الـ webhook 3 = Finished
      void sendWebhook(v.guid, 3);
    });
  };

  const json = (res: ServerResponse, status: number, body: unknown, extra: Record<string, string> = {}) => {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", ...extra });
    res.end(JSON.stringify(body));
  };

  const cors = (req: IncomingMessage): Record<string, string> => ({
    "Access-Control-Allow-Origin": (req.headers.origin as string) ?? "*",
    "Access-Control-Allow-Methods": "POST, GET, HEAD, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": CORS_ALLOW_HEADERS,
    "Access-Control-Expose-Headers": "Location, Upload-Offset, Upload-Length, Tus-Resumable, Tus-Version, Tus-Extension",
    "Access-Control-Max-Age": "86400",
  });

  /** التحقق من ترويسات تفويض TUS — في كل طلب (POST/HEAD/PATCH) كما في الوثائق */
  const tusAuth = (req: IncomingMessage): { ok: true; guid: string; expire: number } | { ok: false; status: number; msg: string } => {
    const sig = String(req.headers["authorizationsignature"] ?? "");
    const expire = Number(req.headers["authorizationexpire"] ?? NaN);
    const videoId = String(req.headers["videoid"] ?? "");
    const lib = String(req.headers["libraryid"] ?? "");
    if (!sig || !Number.isFinite(expire) || !videoId || !lib) return { ok: false, status: 401, msg: "Missing authorization headers" };
    if (lib !== libraryId) return { ok: false, status: 401, msg: "Invalid library" };
    if (expire < Math.floor(Date.now() / 1000)) return { ok: false, status: 401, msg: "Authorization expired" };
    if (sig !== sha256Hex(`${libraryId}${apiKey}${expire}${videoId}`)) return { ok: false, status: 401, msg: "Invalid signature" };
    if (!state.videos.has(videoId)) return { ok: false, status: 404, msg: "Video not found" };
    return { ok: true, guid: videoId, expire };
  };

  const embedTokenOk = (guid: string, token: string | null, expires: string | null) => {
    if (!token || !expires) return false;
    const exp = Number(expires);
    if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
    return token === sha256Hex(`${tokenKey}${guid}${expires}`);
  };

  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://sim");
    const path = url.pathname;
    const method = req.method ?? "GET";
    const record = (status: number) => state.requests.push({ method, path, status });

    if (path === "/__sim/health") {
      record(200);
      return json(res, 200, { ok: true, simulator: "bunny-stream", testDouble: true });
    }

    // ---------------------------------------------------------- TUS
    if (path === "/tusupload" || path.startsWith("/tusupload/")) {
      const headers = { ...TUS_HEADERS, ...cors(req) };
      if (method === "OPTIONS") {
        record(204);
        res.writeHead(204, headers);
        return res.end();
      }
      const auth = tusAuth(req);
      if (!auth.ok) {
        record(auth.status);
        res.writeHead(auth.status, { ...headers, "content-type": "text/plain" });
        return res.end(auth.msg);
      }
      if (method === "POST" && path === "/tusupload") {
        const length = Number(req.headers["upload-length"]);
        if (!Number.isInteger(length) || length <= 0) {
          record(400);
          res.writeHead(400, headers);
          return res.end("Upload-Length required");
        }
        const upload: TusUpload = { id: randomUUID(), guid: auth.guid, length, offset: 0, chunks: [], metadata: parseMetadata(req.headers["upload-metadata"] as string), expire: auth.expire };
        state.uploads.set(upload.id, upload);
        const body = await readBody(req);
        if (body.length && String(req.headers["content-type"] ?? "").startsWith("application/offset+octet-stream")) {
          upload.chunks.push(body);
          upload.offset += body.length;
        }
        const extra: Record<string, string> = { Location: `${baseUrl}/tusupload/${upload.id}` };
        if (upload.offset) extra["Upload-Offset"] = String(upload.offset);
        record(201);
        res.writeHead(201, { ...headers, ...extra });
        res.end();
        if (upload.offset === upload.length) onUploadComplete(upload);
        return;
      }
      const uploadId = path.split("/")[2];
      const upload = uploadId ? state.uploads.get(uploadId) : undefined;
      if (!upload || upload.guid !== auth.guid) {
        record(404);
        res.writeHead(404, headers);
        return res.end("Upload not found");
      }
      if (method === "HEAD") {
        record(200);
        res.writeHead(200, { ...headers, "Upload-Offset": String(upload.offset), "Upload-Length": String(upload.length), "Cache-Control": "no-store" });
        return res.end();
      }
      if (method === "PATCH") {
        if (!String(req.headers["content-type"] ?? "").startsWith("application/offset+octet-stream")) {
          record(415);
          res.writeHead(415, headers);
          return res.end("Content-Type must be application/offset+octet-stream");
        }
        const offset = Number(req.headers["upload-offset"]);
        if (offset !== upload.offset) {
          record(409);
          res.writeHead(409, headers);
          return res.end("Offset mismatch");
        }
        const body = await readBody(req);
        if (upload.offset + body.length > upload.length) {
          record(400);
          res.writeHead(400, headers);
          return res.end("Exceeds Upload-Length");
        }
        upload.chunks.push(body);
        upload.offset += body.length;
        record(204);
        res.writeHead(204, { ...headers, "Upload-Offset": String(upload.offset) });
        res.end();
        if (upload.offset === upload.length) onUploadComplete(upload);
        return;
      }
      if (method === "DELETE") {
        state.uploads.delete(upload.id);
        record(204);
        res.writeHead(204, headers);
        return res.end();
      }
      record(405);
      res.writeHead(405, headers);
      return res.end();
    }

    // ---------------------------------------------------------- Embed / play
    const embed = path.match(/^\/embed\/([^/]+)\/([0-9a-f-]{36})$/i);
    const play = path.match(/^\/play\/([^/]+)\/([0-9a-f-]{36})$/i);
    if ((embed || play) && method === "GET") {
      const [, lib, guid] = (embed ?? play)!;
      const v = state.videos.get(guid);
      const token = url.searchParams.get("token");
      const expires = url.searchParams.get("expires");
      if (lib !== libraryId || !v || !embedTokenOk(guid, token, expires)) {
        record(403);
        res.writeHead(403, { "content-type": "text/html; charset=utf-8" });
        return res.end(`<!doctype html><title>403</title><p data-testid="sim-embed-denied">403 Forbidden — invalid or expired token</p>`);
      }
      if (play) {
        if (!v.bytes || v.status !== 4) {
          record(404);
          res.writeHead(404);
          return res.end();
        }
        const size = v.bytes.length;
        const range = req.headers.range;
        const m = range?.match(/bytes=(\d*)-(\d*)/);
        if (m) {
          let start = m[1] ? Number(m[1]) : 0;
          let end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
          if (!m[1] && m[2]) {
            start = Math.max(0, size - Number(m[2]));
            end = size - 1;
          }
          if (start >= size || start > end) {
            record(416);
            res.writeHead(416, { "content-range": `bytes */${size}` });
            return res.end();
          }
          record(206);
          res.writeHead(206, { "content-type": "video/mp4", "accept-ranges": "bytes", "content-length": String(end - start + 1), "content-range": `bytes ${start}-${end}/${size}` });
          return res.end(v.bytes.subarray(start, end + 1));
        }
        record(200);
        res.writeHead(200, { "content-type": "video/mp4", "accept-ranges": "bytes", "content-length": String(size) });
        return res.end(v.bytes);
      }
      record(200);
      const ready = v.status === 4 && v.bytes;
      const src = `/play/${lib}/${guid}?${url.searchParams.toString()}`;
      const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Bunny Stream (simulator)</title>
<style>html,body{margin:0;height:100%;background:#000;color:#fff;font-family:sans-serif}video{width:100%;height:100%;display:block}</style>
<script>${playerJs()}</script></head>
<body data-testid="sim-embed-ok" data-video="${guid}">
${ready ? `<video data-testid="sim-video" src="${src}" playsinline controls preload="metadata"></video>` : `<p data-testid="sim-embed-processing">Video is processing</p>`}
<script>
(function(){
  var v = document.querySelector("video");
  if (v && window.playerjs) { window.__adapter = playerjs.HTML5Adapter(v); window.__adapter.ready(); }
  var t = new URLSearchParams(location.search).get("t");
  if (v && t) v.addEventListener("loadedmetadata", function(){ v.currentTime = Number(t) || 0; }, { once: true });
})();
</script></body></html>`;
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(html);
    }

    // ---------------------------------------------------------- API
    const api = path.match(/^\/library\/([^/]+)\/videos(?:\/([^/]+))?$/);
    if (api) {
      const [, lib, guid] = api;
      if (req.headers["accesskey"] !== apiKey || lib !== libraryId) {
        record(401);
        return json(res, 401, { success: false, message: "Unauthorized", statusCode: 401 });
      }
      if (!guid && method === "POST") {
        const body = await readBody(req);
        let data: { title?: string } = {};
        try {
          data = body.length ? JSON.parse(body.toString("utf8")) : {};
        } catch {
          record(400);
          return json(res, 400, { success: false, message: "Invalid JSON", statusCode: 400 });
        }
        if (!data.title || typeof data.title !== "string") {
          record(400);
          return json(res, 400, { success: false, message: "Title is required", statusCode: 400 });
        }
        const v: SimVideo = {
          guid: randomUUID(),
          videoLibraryId: Number(libraryId),
          title: data.title,
          dateUploaded: new Date().toISOString(),
          status: 0,
          length: 0,
          encodeProgress: 0,
          availableResolutions: null,
          thumbnailFileName: null,
          width: 0,
          height: 0,
          storageSize: 0,
          bytes: null,
        };
        state.videos.set(v.guid, v);
        record(200);
        return json(res, 200, publicVideo(v));
      }
      if (!guid && method === "GET") {
        record(200);
        const items = [...state.videos.values()].map(publicVideo);
        return json(res, 200, { totalItems: items.length, currentPage: 1, itemsPerPage: 100, items });
      }
      const v = guid ? state.videos.get(guid) : undefined;
      if (!v) {
        record(404);
        return json(res, 404, { success: false, message: "Video not found", statusCode: 404 });
      }
      if (method === "GET") {
        record(200);
        return json(res, 200, publicVideo(v));
      }
      if (method === "DELETE") {
        state.videos.delete(v.guid);
        record(200);
        return json(res, 200, { success: true, message: "OK", statusCode: 200 });
      }
      if (method === "POST") {
        const body = await readBody(req);
        try {
          const data = JSON.parse(body.toString("utf8") || "{}") as { title?: string };
          if (data.title) v.title = data.title;
        } catch {
          /* ignore */
        }
        record(200);
        return json(res, 200, { success: true, message: "OK", statusCode: 200 });
      }
    }

    record(404);
    return json(res, 404, { success: false, message: "Not found", statusCode: 404 });
  };

  const server: Server = createServer((req, res) => {
    handle(req, res).catch((err) => {
      res.writeHead(500, { "content-type": "text/plain" });
      res.end(String(err));
    });
  });
  await new Promise<void>((r) => server.listen(opts.port ?? 0, opts.host ?? "127.0.0.1", () => r()));
  const addr = server.address() as AddressInfo;
  baseUrl = `http://${opts.host ?? "127.0.0.1"}:${addr.port}`;

  return {
    url: baseUrl,
    libraryId,
    apiKey,
    tokenKey,
    readOnlyKey,
    state,
    setStatus(guid, status, length) {
      const v = state.videos.get(guid);
      if (!v) throw new Error(`unknown video ${guid}`);
      v.status = status;
      if (length !== undefined) v.length = length;
    },
    failNext() {
      failNextUpload = true;
    },
    sendWebhook,
    buildWebhook,
    signEmbed(guid, expires) {
      const token = sha256Hex(`${tokenKey}${guid}${expires}`);
      return `${baseUrl}/embed/${libraryId}/${guid}?token=${token}&expires=${expires}`;
    },
    async close() {
      for (const t of timers) clearTimeout(t);
      timers.clear();
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}
