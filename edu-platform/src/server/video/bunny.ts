import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../env";
import { isUuid } from "@/lib/uuid";

/**
 * عميل Bunny Stream — مبني على الوثائق الرسمية:
 *  - API:   {API_BASE}/library/{libraryId}/videos  (ترويسة AccessKey = مفتاح المكتبة)
 *  - رفع TUS مباشر من المتصفح إلى {TUS_ENDPOINT} مع توقيع يصدره الخادم:
 *      AuthorizationSignature = SHA256_HEX(libraryId + apiKey + expire + videoId)
 *      AuthorizationExpire (ثوانٍ) + VideoId + LibraryId
 *  - التضمين المحمي: {EMBED_BASE}/embed/{libraryId}/{videoId}?token=SHA256_HEX(tokenKey + videoId + expires)&expires=
 *  - Webhook: {VideoLibraryId, VideoGuid, Status} مع ترويسة X-BunnyStream-Signature
 *      = HEX(HMAC-SHA256(rawBody, readOnlyApiKey)) — نعيد الاستعلام من API ولا نثق بالمحتوى
 * حالات كائن الفيديو في API: 0 Created، 1 Uploaded، 2 Processing، 3 Transcoding، 4 Finished، 5 Error، 6 UploadFailed
 */

export class BunnyError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "BunnyError";
  }
}

export type BunnyVideo = {
  guid: string;
  videoLibraryId: number;
  title: string;
  status: number;
  length: number;
  encodeProgress: number;
  availableResolutions: string | null;
  thumbnailFileName: string | null;
  width: number;
  height: number;
  storageSize: number;
};

export function bunnyConfigured(): boolean {
  const e = env();
  return Boolean(e.BUNNY_STREAM_LIBRARY_ID && e.BUNNY_STREAM_API_KEY && e.BUNNY_STREAM_TOKEN_KEY);
}

function cfg() {
  const e = env();
  if (!e.BUNNY_STREAM_LIBRARY_ID || !e.BUNNY_STREAM_API_KEY) throw new BunnyError("Bunny Stream غير مضبوط");
  return {
    libraryId: e.BUNNY_STREAM_LIBRARY_ID,
    apiKey: e.BUNNY_STREAM_API_KEY,
    apiBase: e.BUNNY_STREAM_API_BASE.replace(/\/$/, ""),
    tusEndpoint: e.BUNNY_STREAM_TUS_ENDPOINT,
    embedBase: e.BUNNY_STREAM_EMBED_BASE.replace(/\/$/, ""),
    tokenKey: e.BUNNY_STREAM_TOKEN_KEY ?? "",
  };
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const c = cfg();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  let res: Response;
  try {
    res = await fetch(`${c.apiBase}/library/${encodeURIComponent(c.libraryId)}${path}`, {
      method,
      headers: { AccessKey: c.apiKey, accept: "application/json", ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (err) {
    throw new BunnyError(`تعذر الاتصال بـ Bunny Stream: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  if (!res.ok) throw new BunnyError(`Bunny Stream ${res.status}: ${text.slice(0, 200)}`, res.status);
  return (text ? JSON.parse(text) : {}) as T;
}

export async function createVideo(title: string): Promise<BunnyVideo> {
  return call<BunnyVideo>("POST", "/videos", { title: title.slice(0, 200) });
}

export async function getVideo(videoId: string): Promise<BunnyVideo> {
  if (!isUuid(videoId)) throw new BunnyError("معرف فيديو غير صالح");
  return call<BunnyVideo>("GET", `/videos/${videoId}`);
}

export async function deleteVideo(videoId: string): Promise<void> {
  if (!isUuid(videoId)) return;
  await call("DELETE", `/videos/${videoId}`);
}

/** بيانات رفع TUS مباشر من المتصفح (المفتاح السري لا يغادر الخادم) */
export function tusUploadCredentials(videoId: string, ttlSeconds = 6 * 60 * 60) {
  const c = cfg();
  const expire = Math.floor(Date.now() / 1000) + ttlSeconds;
  const signature = createHash("sha256").update(`${c.libraryId}${c.apiKey}${expire}${videoId}`).digest("hex");
  return {
    endpoint: c.tusEndpoint,
    headers: {
      AuthorizationSignature: signature,
      AuthorizationExpire: String(expire),
      VideoId: videoId,
      LibraryId: String(c.libraryId),
    },
    expire,
  };
}

/** رابط تضمين موقّع قصير الصلاحية — يُصدر فقط بعد التحقق من صلاحية الطالب */
export function signedEmbedUrl(videoId: string, opts: { ttlSeconds?: number; autoplay?: boolean; startAt?: number } = {}): string {
  const c = cfg();
  const expires = Math.floor(Date.now() / 1000) + (opts.ttlSeconds ?? 3 * 60 * 60);
  const token = createHash("sha256").update(`${c.tokenKey}${videoId}${expires}`).digest("hex");
  const q = new URLSearchParams({
    token,
    expires: String(expires),
    autoplay: opts.autoplay ? "true" : "false",
    preload: "true",
    responsive: "true",
    // تشغيل داخل الصفحة على iPhone بدل ملء الشاشة الإجباري
    playsinline: "true",
  });
  if (opts.startAt && opts.startAt > 0) q.set("t", String(Math.floor(opts.startAt)));
  return `${c.embedBase}/embed/${encodeURIComponent(c.libraryId)}/${videoId}?${q.toString()}`;
}

/** صورة مصغرة يولدها Bunny (إن ضُبط نطاق CDN) */
export function bunnyThumbnailUrl(videoId: string, fileName: string | null): string | null {
  const host = env().BUNNY_STREAM_CDN_HOSTNAME;
  if (!host || !fileName) return null;
  return `https://${host}/${videoId}/${fileName}`;
}

/** تحويل حالة كائن الفيديو إلى حالة المعالجة لدينا */
export function mapBunnyStatus(v: Pick<BunnyVideo, "status">): "uploading" | "processing" | "ready" | "failed" {
  switch (v.status) {
    case 0:
      return "uploading";
    case 1:
    case 2:
    case 3:
    case 7:
    case 8:
      return "processing";
    case 4:
      return "ready";
    case 5:
    case 6:
      return "failed";
    default:
      return "processing";
  }
}

/** التحقق من توقيع Webhook (v1): HMAC-SHA256 للجسم الخام بمفتاح القراءة فقط، بترميز hex صغير. الوثائق تطلب التأكد من الإصدار والخوارزمية */
export function verifyBunnyWebhookSignature(rawBody: string, signature: string | null, version: string | null, secret: string, algorithm: string | null = null): boolean {
  if (!signature || !secret) return false;
  if (version && version.toLowerCase() !== "v1") return false;
  if (algorithm && algorithm.toLowerCase() !== "hmac-sha256") return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature.trim().toLowerCase());
  return a.length === b.length && timingSafeEqual(a, b);
}
