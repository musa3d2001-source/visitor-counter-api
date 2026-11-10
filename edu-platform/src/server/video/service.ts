import "server-only";
import { createHash } from "node:crypto";
import { sql } from "../db";
import { env } from "../env";
import { storage } from "../storage";
import { BunnyError, bunnyConfigured, getVideo, mapBunnyStatus, verifyBunnyWebhookSignature } from "./bunny";
import { fingerprintOf, sameVideo, type VideoFingerprint } from "./fingerprint";
import { mp4DurationSeconds } from "./mp4";
import { audit } from "../platform/audit";
import { sendOpsAlert } from "../platform/ops-alerts";
import { reportError } from "../platform/report-error";
import { isDatabaseBusy } from "../db-busy";
import { isUuid } from "@/lib/uuid";

/** المزود المستخدم للرفع الجديد */
export function activeVideoProvider(): "file" | "bunny" {
  return env().VIDEO_PROVIDER;
}

/**
 * حجب درس تغيّر ملفه بعد اعتماده: يختفي عن الطلاب ويتوقف بيع منتجه حتى يقرر المالك.
 * الشرط يجعل الحجب مرة واحدة مهما تزامن الإشعار والوظيفة اليومية، فسجل واحد ورسالة واحدة.
 */
async function holdChangedVideo(lessonId: string, productId: string, seen: VideoFingerprint): Promise<void> {
  const held = await sql.begin(async (tx) => {
    const rows = await tx`
      update lessons set processing_status = 'held', video_hold_fingerprint = ${tx.json(seen as never)}, processing_error = null, status_checked_at = now()
      where id = ${lessonId} and processing_status <> 'held'
      returning id
    `;
    if (rows.length) await audit({ actorId: null, action: "lesson.video_changed", entityType: "product", entityId: productId, metadata: { lessonId } }, tx);
    return rows.length > 0;
  });
  if (held) await sendOpsAlert("video_changed");
}

/**
 * مزامنة حالة معالجة درس Bunny من API (مصدر الحقيقة).
 * لا يُسمح بنشر منتج فيديو قبل أن تصبح دروسه المنشورة «جاهزة».
 *
 * عند الجاهزية تُقارن بصمة الفيديو بما اعتُمد: أول بصمة تُحفظ، وتغيرها في مسودة طبيعي، وتغيرها بعد الإرسال للمراجعة يحجب الدرس.
 * الدرس المحجوب لا تغير حالته مزامنة، وقبول المالك وحده يعيده.
 */
export async function syncLessonStatus(lessonId: string): Promise<{ status: string; duration: number | null } | null> {
  const [l] = await sql<{ id: string; product_id: string; provider: string; video_ref: string; processing_status: string; duration_seconds: number | null; video_fingerprint: VideoFingerprint | null; product_status: string }[]>`
    select l.id, l.product_id, l.provider, l.video_ref, l.processing_status, l.duration_seconds, l.video_fingerprint, p.status as product_status
    from lessons l join products p on p.id = l.product_id where l.id = ${lessonId}
  `;
  if (!l) return null;
  if (l.provider !== "bunny") return { status: l.processing_status, duration: l.duration_seconds };
  if (l.processing_status === "held") {
    await sql`update lessons set status_checked_at = now() where id = ${lessonId}`;
    return { status: "held", duration: l.duration_seconds };
  }
  try {
    const v = await getVideo(l.video_ref);
    const status = mapBunnyStatus(v);
    const duration = v.length > 0 ? Math.round(v.length) : l.duration_seconds;
    if (status === "ready") {
      const seen = fingerprintOf(v);
      if (l.video_fingerprint && !sameVideo(l.video_fingerprint, seen) && l.product_status !== "draft") {
        await holdChangedVideo(l.id, l.product_id, seen);
        return { status: "held", duration: l.duration_seconds };
      }
      await sql`
        update lessons set processing_status = 'ready', duration_seconds = ${duration}, video_fingerprint = ${sql.json(seen as never)},
          processing_error = null, status_checked_at = now()
        where id = ${lessonId} and processing_status <> 'held'
      `;
      return { status, duration };
    }
    await sql`
      update lessons set processing_status = ${status}, duration_seconds = ${duration},
        processing_error = ${status === "failed" ? `Bunny status ${v.status}` : null}, status_checked_at = now()
      where id = ${lessonId} and processing_status <> 'held'
    `;
    return { status, duration };
  } catch (err) {
    const msg = err instanceof BunnyError ? err.message : String(err);
    await sql`update lessons set status_checked_at = now(), processing_error = ${msg.slice(0, 300)} where id = ${lessonId}`;
    if (err instanceof BunnyError && err.status === 404) {
      await sql`update lessons set processing_status = 'failed' where id = ${lessonId} and processing_status <> 'held'`;
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

/** قبل نشر منتج أو اعتماده: ما يراه الطلاب هو ما في Bunny الآن، ولو ضاع إشعار. يرمي إن تعذر التحقق */
export async function verifyBunnyLessonsForPublish(productId: string): Promise<void> {
  if (!bunnyConfigured()) return;
  const rows = await sql<{ id: string }[]>`select id from lessons where product_id = ${productId} and provider = 'bunny' and is_published and processing_status <> 'held'`;
  for (const r of rows) await syncLessonStatus(r.id);
}

/** حدود جولة الفيديو اليومية: كل مزامنة طلب إلى Bunny مهلته 15 ثانية، فالمدة والعدد محدودان، وما لم يُفحص يأتي دوره غدًا */
export const DAILY_VIDEO_CHECK = { budgetMs: 40_000, pendingBatch: 200, verifyBatch: 200, stopAfterFailures: 3 } as const;

export type DailyVideoReport = { checked: number; failed: number; held: number; finished: boolean };

/**
 * الجولة اليومية: الدروس التي ما زالت قيد المعالجة (ضاع إشعارها)، ثم الدروس الجاهزة الأقدم فحصًا (هل تغير ملفها؟).
 * فشل درس واحد لا يوقف البقية، وثلاثة متتالية تعني أن Bunny نفسه متعطل فلا معنى لانتظار مهلها.
 */
export async function dailyVideoCheck(): Promise<DailyVideoReport> {
  const report: DailyVideoReport = { checked: 0, failed: 0, held: 0, finished: true };
  if (!bunnyConfigured()) return report;
  const deadline = Date.now() + DAILY_VIDEO_CHECK.budgetMs;
  const rows = await sql<{ id: string }[]>`
    select id from (
      (select id, 0 as rank, status_checked_at from lessons where provider = 'bunny' and processing_status in ('uploading', 'processing') order by status_checked_at nulls first limit ${DAILY_VIDEO_CHECK.pendingBatch})
      union all
      (select id, 1 as rank, status_checked_at from lessons where provider = 'bunny' and processing_status = 'ready' and is_published order by status_checked_at nulls first limit ${DAILY_VIDEO_CHECK.verifyBatch})
    ) due order by rank, status_checked_at nulls first
  `;
  let inARow = 0;
  let lastError: unknown = null;
  for (const r of rows) {
    if (Date.now() > deadline) {
      report.finished = false;
      break;
    }
    try {
      const s = await syncLessonStatus(r.id);
      report.checked++;
      if (s?.status === "held") report.held++;
      inARow = 0;
    } catch (err) {
      if (isDatabaseBusy(err)) throw err;
      report.failed++;
      lastError = err;
      if (++inARow >= DAILY_VIDEO_CHECK.stopAfterFailures) {
        report.finished = false;
        break;
      }
    }
  }
  // سطر واحد في سجل الأخطاء مهما تعدد الفشل في الجولة
  if (lastError) await reportError("video:daily", lastError);
  return report;
}

/**
 * Webhook من Bunny Stream: التوقيع أولًا قبل أي عمل، ثم نعيد الاستعلام من API — محتوى الإشعار لا يغيّر الحالة بنفسه.
 *
 * الحدث يُسجَّل بعد نجاح المزامنة فقط: إن فشلت يرد الخادم بخطأ فيعيد Bunny الإرسال، فيعالج الحدث من جديد.
 * المزامنة تقرأ الحقيقة من API ولا أثر لتكرارها، فتزامن نسختين من الإشعار لا يضر ولا يحتاج قفلًا.
 * إعادة الإرسال بالجسم نفسه حرفيًا و EventId يميز الأحداث، فبصمة الجسم تصلح مفتاحًا.
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
  const seen = await sql`select 1 from video_events where event_key = ${key} and result is not null`;
  if (seen.length) return { status: 200, result: "duplicate ignored" };
  const [l] = await sql<{ id: string }[]>`select id from lessons where provider = 'bunny' and video_ref = ${body.VideoGuid}`;
  // لو فشلت المزامنة ترمي، فلا يُسجَّل الحدث
  const result = l ? ((await syncLessonStatus(l.id))?.status ?? "none") : "unknown video";
  await sql`
    insert into video_events (provider, event_key, payload, result) values ('bunny', ${key}, ${sql.json(body as never)}, ${result})
    on conflict (event_key) do update set result = excluded.result where video_events.result is null
  `;
  return { status: 200, result };
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
