import "server-only";
import { sql } from "../db";
import { hasProductAccess, isTeacherOfProduct, ownedCte } from "./entitlements";
import { EMBED_TOKEN_TTL_SECONDS, signedEmbedUrl } from "../video/bunny";
import { closedVideoProductIds } from "../video/policy";
import { getSettings } from "../platform/settings";
import { isUuid } from "@/lib/uuid";

export type LessonRow = {
  id: string;
  product_id: string;
  title: string;
  provider: "file" | "bunny";
  video_ref: string;
  mime_type: string | null;
  size_bytes: string | number | null;
  duration_seconds: number | null;
  is_free_preview: boolean;
  is_published: boolean;
  processing_status: "uploading" | "processing" | "ready" | "failed" | "held";
  product_status: string;
};

export type LessonAccess =
  | { ok: true; lesson: LessonRow; via: "staff" | "free" | "owned" }
  | { ok: false; reason: "not_found" | "unauthenticated" | "forbidden" | "not_ready" };

/**
 * صلاحية مشاهدة درس (على الخادم دائمًا):
 *  - المالك، ومعلم المنتج نفسه (للمعاينة داخل اللوحة)
 *  - الدرس المجاني: لأي زائر إن كان المنتج منشورًا والدرس جاهزًا والفيديو غير مغلق (انظر video/policy)
 *  - غير ذلك: لمن يملك المنتج (مباشرة أو عبر باقة/دورة) وصلاحيته غير منتهية
 * الدرس غير الجاهز (قيد المعالجة) لا يُعرض للطلاب. إغلاق الفيديو لا يمس حق من اشترى.
 * ownedProductIds: ما قرأه هذا الطلب نفسه من قاعدة البيانات للتو (readWatchContext)، فلا يُقرأ مرتين. لا يُمرر من أي ذاكرة.
 */
export async function checkLessonAccess(lessonId: string, user: { id: string; role: string } | null, known?: { ownedProductIds: ReadonlySet<string> }): Promise<LessonAccess> {
  if (!isUuid(lessonId)) return { ok: false, reason: "not_found" };
  const [l] = await sql<LessonRow[]>`
    select l.id, l.product_id, l.title, l.provider, l.video_ref, l.mime_type, l.size_bytes, l.duration_seconds,
      l.is_free_preview, l.is_published, l.processing_status, p.status as product_status
    from lessons l join products p on p.id = l.product_id where l.id = ${lessonId}
  `;
  if (!l) return { ok: false, reason: "not_found" };
  if (user?.role === "admin") return { ok: true, lesson: l, via: "staff" };
  if (user?.role === "teacher" && (await isTeacherOfProduct(user.id, l.product_id))) return { ok: true, lesson: l, via: "staff" };
  if (!l.is_published) return { ok: false, reason: "not_found" };
  if (l.processing_status !== "ready") return { ok: false, reason: "not_ready" };
  if (l.is_free_preview && l.product_status === "published" && !(await closedVideoProductIds(sql, [l.product_id], await getSettings())).size) return { ok: true, lesson: l, via: "free" };
  if (!user) return { ok: false, reason: "unauthenticated" };
  if (known ? known.ownedProductIds.has(l.product_id) : await hasProductAccess(user.id, l.product_id)) return { ok: true, lesson: l, via: "owned" };
  return { ok: false, reason: "forbidden" };
}

export type WatchContext = {
  product: { id: string; slug: string; title: string; status: string };
  /** المالك، أو معلم هذا المنتج نفسه */
  staff: boolean;
  owned: Set<string>;
};

/**
 * ما يقرر الوصول إلى صفحة المشاهدة، بأمر واحد ومن قاعدة البيانات دائمًا: حالة المنتج، وهل المشاهد معلمه، وما يملكه الآن.
 * قوائم الدروس وبياناتها تأتي بعده، أما هذا فلا يمر بأي ذاكرة بين الطلبات.
 */
export async function readWatchContext(productId: string, user: { id: string; role: string } | null): Promise<WatchContext | null> {
  const userId = user?.id ?? null;
  const [row] = await sql<{ id: string; slug: string; title: string; status: string; teaches: boolean; owned: string[] }[]>`
    with recursive ${ownedCte(sql, userId)}
    select p.id, p.slug, p.title, p.status,
      exists (select 1 from teachers t where t.id = p.teacher_id and t.user_id = ${userId} and t.mode = 'self_managed') as teaches,
      coalesce((select json_agg(distinct product_id) from owned), '[]'::json) as owned
    from products p where p.id = ${productId}
  `;
  if (!row) return null;
  return {
    product: { id: row.id, slug: row.slug, title: row.title, status: row.status },
    staff: user?.role === "admin" || (user?.role === "teacher" && row.teaches),
    owned: new Set(row.owned),
  };
}

export type Playback =
  | { kind: "file"; src: string }
  | { kind: "bunny"; embedUrl: string; expiresInSeconds: number };

/** مصدر التشغيل بعد التحقق من الصلاحية — رابط Bunny موقّع وقصير الصلاحية، أو مسار البث المحمي للملفات */
export function playbackFor(lesson: Pick<LessonRow, "id" | "provider" | "video_ref">, opts: { startAt?: number } = {}): Playback {
  if (lesson.provider === "bunny") return { kind: "bunny", embedUrl: signedEmbedUrl(lesson.video_ref, { startAt: opts.startAt }), expiresInSeconds: EMBED_TOKEN_TTL_SECONDS };
  return { kind: "file", src: `/api/lessons/${lesson.id}/stream` };
}

/** للتوافق مع الكود السابق */
export function bunnyEmbedUrl(videoId: string): string | null {
  try {
    return signedEmbedUrl(videoId);
  } catch {
    return null;
  }
}
