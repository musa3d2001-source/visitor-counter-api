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
 *
 * known: ما قرأه هذا الطلب نفسه من قاعدة البيانات للتو، فلا يُقرأ مرتين. لا يُمرر من أي ذاكرة بين الطلبات.
 *  - ownedProductIds من readWatchContext: يُفحص قبل المعاينة المجانية لأنه لا يكلف أمرًا، والمالك لا تمسه المعاينة ولا الإغلاق.
 *  - closed من readClosedVideo: إغلاق الفيديو محسوبًا مرة واحدة للصفحة. منتج لا يغطيه يُفحص هنا من جديد.
 */
export type KnownForRequest = { ownedProductIds: ReadonlySet<string>; closed?: ClosedVideoRead };

export async function checkLessonAccess(lessonId: string, user: { id: string; role: string } | null, known?: KnownForRequest): Promise<LessonAccess> {
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
  if (user && known?.ownedProductIds.has(l.product_id)) return { ok: true, lesson: l, via: "owned" };
  if (l.is_free_preview && l.product_status === "published" && !(await videoClosedFor(l.product_id, known?.closed))) return { ok: true, lesson: l, via: "free" };
  if (!user) return { ok: false, reason: "unauthenticated" };
  if (!known && (await hasProductAccess(user.id, l.product_id))) return { ok: true, lesson: l, via: "owned" };
  return { ok: false, reason: "forbidden" };
}

/** إغلاق الفيديو لمنتجات بعينها، يُقرأ مرة واحدة في الطلب: covers ما سُئل عنه، وids ما وُجد منها مغلقًا */
export type ClosedVideoRead = { covers: ReadonlySet<string>; ids: Promise<ReadonlySet<string>> };

/**
 * صفحة المشاهدة تسأل مرة واحدة عن المنتج ومنتجات دروسه كلها (الإعدادات من قاعدة البيانات، ثم أمر واحد للإغلاق إن لزم)،
 * ففحص كل درس بعدها يقرأ الجواب نفسه بدل أن يعيد السؤال. لا يُحفظ بين الطلبات: قرار المالك بالإغلاق يسري في الطلب التالي.
 */
export function readClosedVideo(productIds: string[]): ClosedVideoRead {
  const covers = new Set(productIds);
  return { covers, ids: getSettings().then((settings) => closedVideoProductIds(sql, [...covers], settings)) };
}

async function videoClosedFor(productId: string, read: ClosedVideoRead | undefined): Promise<boolean> {
  if (read?.covers.has(productId)) return (await read.ids).has(productId);
  return (await closedVideoProductIds(sql, [productId], await getSettings())).size > 0;
}

export type WatchProgress = { lesson_id: string; position_seconds: number; completed: boolean };

export type WatchContext = {
  product: { id: string; slug: string; title: string; status: string };
  /** المالك، أو معلم هذا المنتج نفسه */
  staff: boolean;
  owned: Set<string>;
  /** تقدم المشاهد في دروس هذا المنتج ومحتوياته، الأحدث أولًا. فارغ للزائر */
  progress: WatchProgress[];
};

/**
 * ما يقرر الوصول إلى صفحة المشاهدة، بأمر واحد ومن قاعدة البيانات دائمًا: حالة المنتج، وهل المشاهد معلمه، وما يملكه الآن،
 * وتقدمه في دروس المنتج ومحتوياته (بعمق الشجرة نفسه الذي تبني به getPlaylist قائمتها). الصفحة تبقي منه دروس قائمتها فقط.
 * قوائم الدروس وبياناتها تأتي بعده، أما هذا فلا يمر بأي ذاكرة بين الطلبات.
 */
export async function readWatchContext(productId: string, user: { id: string; role: string } | null): Promise<WatchContext | null> {
  const userId = user?.id ?? null;
  const [row] = await sql<{ id: string; slug: string; title: string; status: string; teaches: boolean; owned: string[]; progress: WatchProgress[] }[]>`
    with recursive ${ownedCte(sql, userId)}${
      userId
        ? sql`,
    tree(id, depth) as (
      select ${productId}::uuid, 0
      union
      select bi.product_id, tree.depth + 1 from bundle_items bi join tree on bi.bundle_id = tree.id where tree.depth < 4
    )`
        : sql``
    }
    select p.id, p.slug, p.title, p.status,
      exists (select 1 from teachers t where t.id = p.teacher_id and t.user_id = ${userId} and t.mode = 'self_managed') as teaches,
      coalesce((select json_agg(distinct product_id) from owned), '[]'::json) as owned,
      ${
        userId
          ? sql`coalesce((
        select json_agg(json_build_object('lesson_id', lp.lesson_id, 'position_seconds', lp.position_seconds, 'completed', lp.completed) order by lp.updated_at desc)
        from lesson_progress lp join lessons l on l.id = lp.lesson_id
        where lp.user_id = ${userId} and l.product_id in (select id from tree)
      ), '[]'::json)`
          : sql`'[]'::json`
      } as progress
    from products p where p.id = ${productId}
  `;
  if (!row) return null;
  return {
    product: { id: row.id, slug: row.slug, title: row.title, status: row.status },
    staff: user?.role === "admin" || (user?.role === "teacher" && row.teaches),
    owned: new Set(row.owned),
    progress: row.progress,
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
