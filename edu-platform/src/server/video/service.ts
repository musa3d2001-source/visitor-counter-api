import "server-only";
import { createHash } from "node:crypto";
import { sql } from "../db";
import { env } from "../env";
import { storage } from "../storage";
import { BunnyError, getVideo, mapBunnyStatus, verifyBunnyWebhookSignature } from "./bunny";
import { mp4DurationSeconds } from "./mp4";
import { reportError } from "../platform/report-error";
import { isUuid } from "@/lib/uuid";

/** المزود المستخدم للرفع الجديد */
export function activeVideoProvider(): "file" | "bunny" {
  return env().VIDEO_PROVIDER;
}

/**
 * مزامنة حالة معالجة درس Bunny من API (مصدر الحقيقة).
 * لا يُسمح بنشر منتج فيديو قبل أن تصبح دروسه المنشورة «جاهزة».
 */
export async function syncLessonStatus(lessonId: string): Promise<{ status: string; duration: number | null } | null> {
  const [l] = await sql<{ id: string; provider: string; video_ref: string; processing_status: string; duration_seconds: number | null }[]>`
    select id, provider, video_ref, processing_status, duration_seconds from lessons where id = ${lessonId}
  `;
  if (!l) return null;
  if (l.provider !== "bunny") return { status: l.processing_status, duration: l.duration_seconds };
  try {
    const v = await getVideo(l.video_ref);
    const status = mapBunnyStatus(v);
    const duration = v.length > 0 ? Math.round(v.length) : l.duration_seconds;
    await sql`
      update lessons set processing_status = ${status}, duration_seconds = ${duration},
        processing_error = ${status === "failed" ? `Bunny status ${v.status}` : null}, status_checked_at = now()
      where id = ${lessonId}
    `;
    return { status, duration };
  } catch (err) {
    const msg = err instanceof BunnyError ? err.message : String(err);
    await sql`update lessons set status_checked_at = now(), processing_error = ${msg.slice(0, 300)} where id = ${lessonId}`;
    if (err instanceof BunnyError && err.status === 404) {
      await sql`update lessons set processing_status = 'failed' where id = ${lessonId}`;
      return { status: "failed", duration: l.duration_seconds };
    }
    throw err;
  }
}

/** مزامنة كل الدروس غير الجاهزة لمنتج (أو لكل المنصة) */
export async function syncPendingLessons(productId?: string, limit = 50) {
  const rows = await sql<{ id: string }[]>`
    select id from lessons
    where provider = 'bunny' and processing_status in ('uploading', 'processing')
      ${productId ? sql`and product_id = ${productId}` : sql``}
    order by status_checked_at nulls first limit ${limit}
  `;
  const out: { id: string; status: string }[] = [];
  for (const r of rows) {
    try {
      const s = await syncLessonStatus(r.id);
      if (s) out.push({ id: r.id, status: s.status });
    } catch (err) {
      await reportError("video:sync", err);
    }
  }
  return out;
}

/**
 * Webhook من Bunny Stream: نتحقق من التوقيع (إن ضُبط مفتاح القراءة)، نمنع التكرار،
 * ثم نعيد الاستعلام من API — محتوى الإشعار لا يغيّر الحالة بنفسه.
 */
export async function handleBunnyWebhook(rawBody: string, headers: Headers): Promise<{ status: number; result: string }> {
  const secret = env().BUNNY_STREAM_READONLY_API_KEY;
  if (secret) {
    const ok = verifyBunnyWebhookSignature(rawBody, headers.get("x-bunnystream-signature"), headers.get("x-bunnystream-signature-version"), secret, headers.get("x-bunnystream-signature-algorithm"));
    if (!ok) return { status: 401, result: "invalid signature" };
  } else if (env().NODE_ENV === "production") {
    // في الإنتاج التوقيع إلزامي
    return { status: 401, result: "webhook signing key not configured" };
  }
  let body: { VideoLibraryId?: number | string; VideoGuid?: string; Status?: number };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return { status: 400, result: "invalid json" };
  }
  if (!body.VideoGuid || !isUuid(body.VideoGuid)) return { status: 400, result: "missing video" };
  if (String(body.VideoLibraryId ?? "") !== String(env().BUNNY_STREAM_LIBRARY_ID ?? "")) return { status: 400, result: "wrong library" };
  const key = createHash("sha256").update(rawBody).digest("hex");
  const inserted = await sql`
    insert into video_events (provider, event_key, payload) values ('bunny', ${key}, ${sql.json(body as never)})
    on conflict (event_key) do nothing returning id
  `;
  if (!inserted.length) return { status: 200, result: "duplicate ignored" };
  const [l] = await sql<{ id: string }[]>`select id from lessons where provider = 'bunny' and video_ref = ${body.VideoGuid}`;
  if (!l) {
    await sql`update video_events set result = 'unknown video' where event_key = ${key}`;
    return { status: 200, result: "unknown video" };
  }
  const s = await syncLessonStatus(l.id);
  await sql`update video_events set result = ${s?.status ?? "none"} where event_key = ${key}`;
  return { status: 200, result: s?.status ?? "none" };
}

/** مدة فيديو مرفوع على التخزين الخاص (يقرأ البداية ثم النهاية) */
export async function probeStoredMp4Duration(key: string, size: number): Promise<number | null> {
  try {
    const head = await storage().readHead("private", key, Math.min(size, 2 * 1024 * 1024));
    const d1 = mp4DurationSeconds(head);
    if (d1 !== null) return d1;
    const s = storage();
    if (!s.readRange || size <= head.length) return null;
    const start = Math.max(0, size - 8 * 1024 * 1024);
    const stream = await s.readRange("private", key, start, size - 1);
    const chunks: Uint8Array[] = [];
    const reader = stream.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const total = chunks.reduce((a, c) => a + c.length, 0);
    const buf = new Uint8Array(total);
    let o = 0;
    for (const c of chunks) {
      buf.set(c, o);
      o += c.length;
    }
    return mp4DurationSeconds(buf);
  } catch {
    return null;
  }
}
