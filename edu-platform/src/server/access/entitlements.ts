import "server-only";
import { sql, type Db } from "../db";
import { servablePreviewSql } from "./preview-rule";
import { audit } from "../platform/audit";
import { isContainerType, isVideoType } from "@/lib/labels";

/**
 * صلاحيات الوصول:
 * الطالب يملك المنتج P إذا كانت لديه صلاحية نشطة (غير مسحوبة وغير منتهية) على P مباشرة،
 * أو على حاوية (باقة/دورة/وحدة) تضم P بأي عمق (باقة ← دورة ← وحدات ← دروس منفردة).
 * الحاويات تُحسب ديناميكيًا، فيحصل المشتري تلقائيًا على ما يُضاف لها لاحقًا.
 * عند الشراء تُمنح أيضًا صلاحيات لكل محتويات الحاوية الحالية (source='bundle') حتى لا يفقدها
 * الطالب إن أُزيل عنصر من الحاوية لاحقًا. القيد unique(user_id, product_id) يمنع التكرار.
 */

/** استعلام فرعي: كل المنتجات التي يملكها الطالب حاليًا (مع الاحتواء المتداخل) */
function ownedClosure(db: Db, userId: string) {
  return db`
    with recursive owned(product_id) as (
      select e.product_id from entitlements e
      where e.user_id = ${userId} and e.revoked_at is null and (e.expires_at is null or e.expires_at > now())
      union
      select bi.product_id from owned o join bundle_items bi on bi.bundle_id = o.product_id
    )
    select product_id from owned
  `;
}

export async function hasProductAccess(userId: string, productId: string, db: Db = sql): Promise<boolean> {
  const rows = await db<{ product_id: string }[]>`
    with recursive owned(product_id) as (
      select e.product_id from entitlements e
      where e.user_id = ${userId} and e.revoked_at is null and (e.expires_at is null or e.expires_at > now())
      union
      select bi.product_id from owned o join bundle_items bi on bi.bundle_id = o.product_id
    )
    select product_id from owned where product_id = ${productId} limit 1
  `;
  return rows.length > 0;
}

/** كل معرفات المنتجات التي يملكها الطالب (مباشرة أو عبر حاوية بأي عمق) */
export async function accessibleProductIds(userId: string, db: Db = sql): Promise<Set<string>> {
  const rows = (await ownedClosure(db, userId)) as unknown as { product_id: string }[];
  return new Set(rows.map((r) => r.product_id));
}

/** أقرب تاريخ انتهاء فعّال لوصول الطالب إلى منتج (null = غير محدد) — للعرض فقط */
export async function accessExpiry(userId: string, productId: string, db: Db = sql): Promise<{ has: boolean; expiresAt: Date | null }> {
  const rows = await db<{ expires_at: Date | null }[]>`
    with recursive owned(product_id, expires_at) as (
      select e.product_id, e.expires_at from entitlements e
      where e.user_id = ${userId} and e.revoked_at is null and (e.expires_at is null or e.expires_at > now())
      union
      select bi.product_id, o.expires_at from owned o join bundle_items bi on bi.bundle_id = o.product_id
    )
    select expires_at from owned where product_id = ${productId}
  `;
  if (!rows.length) return { has: false, expiresAt: null };
  if (rows.some((r) => r.expires_at === null)) return { has: true, expiresAt: null };
  const latest = rows.reduce((a, r) => (new Date(r.expires_at!) > a ? new Date(r.expires_at!) : a), new Date(0));
  return { has: true, expiresAt: latest };
}

/** حساب تاريخ انتهاء الوصول من إعدادات المنتج وقت الشراء */
export function computeExpiry(p: { access_mode: string; access_until: Date | string | null; access_days: number | null }, from = new Date()): Date | null {
  if (p.access_mode === "until_date" && p.access_until) return new Date(p.access_until);
  if (p.access_mode === "days" && p.access_days) return new Date(from.getTime() + p.access_days * 86400_000);
  return null;
}

/** كل محتويات حاوية بأي عمق (بدون الحاوية نفسها) */
export async function containerClosure(db: Db, productId: string): Promise<string[]> {
  const rows = await db<{ product_id: string }[]>`
    with recursive c(product_id) as (
      select bi.product_id from bundle_items bi where bi.bundle_id = ${productId}
      union
      select bi.product_id from c join bundle_items bi on bi.bundle_id = c.product_id
    )
    select product_id from c
  `;
  return rows.map((r) => r.product_id);
}

type GrantInput = {
  userId: string;
  productId: string;
  source: "purchase" | "manual" | "free";
  orderId?: string | null;
  grantedBy?: string | null;
  reason?: string | null;
  /** للمنح اليدوي فقط: تاريخ انتهاء صريح (null = غير محدد) */
  expiresAt?: Date | null;
};

/**
 * منح صلاحية (مع توسيع الحاوية لكل محتوياتها). عملية idempotent:
 * إن كانت الصلاحية نشطة بوصول أطول أو مساوٍ لا يحدث شيء، وإن كانت مسحوبة/منتهية/أقصر تُجدَّد.
 * تاريخ الانتهاء يُحسب من إعدادات المنتج المشترى وقت المنح (لا يتأثر بتعديلها لاحقًا).
 * يجب استدعاؤها داخل معاملة عند الربط مع طلب.
 */
export async function grantProduct(db: Db, input: GrantInput): Promise<{ granted: string[]; expiresAt: Date | null }> {
  const granted: string[] = [];
  const [product] = await db<{ id: string; type: string; access_mode: string; access_until: Date | null; access_days: number | null }[]>`
    select id, type, access_mode, access_until, access_days from products where id = ${input.productId}
  `;
  if (!product) throw new Error("PRODUCT_NOT_FOUND");
  const expiresAt = input.source === "manual" && input.expiresAt !== undefined ? input.expiresAt : computeExpiry(product);

  const upsert = async (productId: string, source: string, viaBundleId: string | null) => {
    const rows = await db<{ id: string }[]>`
      insert into entitlements (user_id, product_id, source, order_id, via_bundle_id, granted_by, grant_reason, expires_at)
      values (${input.userId}, ${productId}, ${source}, ${input.orderId ?? null}, ${viaBundleId}, ${input.grantedBy ?? null}, ${input.reason ?? null}, ${expiresAt})
      on conflict (user_id, product_id) do update set
        source = excluded.source,
        order_id = excluded.order_id,
        via_bundle_id = excluded.via_bundle_id,
        granted_by = excluded.granted_by,
        grant_reason = excluded.grant_reason,
        expires_at = excluded.expires_at,
        granted_at = now(),
        revoked_at = null, revoked_by = null, revoke_reason = null
      where entitlements.revoked_at is not null
         or (entitlements.expires_at is not null and entitlements.expires_at <= now())
         or (entitlements.expires_at is not null and (excluded.expires_at is null or excluded.expires_at > entitlements.expires_at))
      returning id
    `;
    if (rows.length) granted.push(productId);
  };

  await upsert(product.id, input.source, null);
  if (isContainerType(product.type)) {
    for (const itemId of await containerClosure(db, product.id)) await upsert(itemId, "bundle", product.id);
  }
  return { granted, expiresAt };
}

/** سحب صلاحية (والعناصر الممنوحة عبر الباقة إن كان المنتج باقة) */
export async function revokeProduct(
  db: Db,
  input: { userId: string; productId: string; revokedBy: string | null; reason: string },
): Promise<number> {
  const rows = await db<{ id: string }[]>`
    update entitlements set revoked_at = now(), revoked_by = ${input.revokedBy}, revoke_reason = ${input.reason}
    where user_id = ${input.userId} and revoked_at is null
      and (product_id = ${input.productId} or (via_bundle_id = ${input.productId} and source = 'bundle'))
    returning id
  `;
  return rows.length;
}

/** منح يدوي من المدير مع سجل تدقيق */
export async function adminGrant(input: { userId: string; productId: string; adminId: string; reason: string; ip?: string; expiresAt?: Date | null }) {
  return sql.begin(async (tx) => {
    const res = await grantProduct(tx, {
      userId: input.userId,
      productId: input.productId,
      source: "manual",
      grantedBy: input.adminId,
      reason: input.reason,
      expiresAt: input.expiresAt,
    });
    await audit(
      {
        actorId: input.adminId,
        action: "entitlement.grant",
        entityType: "user",
        entityId: input.userId,
        reason: input.reason,
        metadata: { productId: input.productId, granted: res.granted },
        ip: input.ip,
      },
      tx,
    );
    return res;
  });
}

export async function adminRevoke(input: { userId: string; productId: string; adminId: string; reason: string; ip?: string }) {
  return sql.begin(async (tx) => {
    const count = await revokeProduct(tx, {
      userId: input.userId,
      productId: input.productId,
      revokedBy: input.adminId,
      reason: input.reason,
    });
    await audit(
      {
        actorId: input.adminId,
        action: "entitlement.revoke",
        entityType: "user",
        entityId: input.userId,
        reason: input.reason,
        metadata: { productId: input.productId, revokedCount: count },
        ip: input.ip,
      },
      tx,
    );
    return count;
  });
}

export type LibraryItem = {
  productId: string;
  slug: string;
  title: string;
  type: string;
  gradeName: string;
  gradeLevel: number;
  subjectName: string | null;
  term: number | null;
  coverKey: string | null;
  isDownloadable: boolean;
  files: { id: string; title: string; pageCount: number | null; lastPage: number | null }[];
  lessonCount: number;
  watchedCount: number;
  teacherName: string | null;
  teacherSlug: string | null;
  expiresAt: Date | null;
  lastActivity: Date | null;
};

/** محتويات مكتبة الطالب: كل المنتجات القابلة للوصول (عدا الباقات نفسها) مع ملفاتها وتقدم القراءة */
export async function getLibrary(userId: string): Promise<{ items: LibraryItem[]; bundles: { id: string; title: string; slug: string }[] }> {
  const ids = [...(await accessibleProductIds(userId))];
  if (ids.length === 0) return { items: [], bundles: [] };
  const products = await sql<
    {
      id: string;
      slug: string;
      title: string;
      type: string;
      grade_name: string;
      grade_level: number;
      subject_name: string | null;
      term: number | null;
      cover_key: string | null;
      is_downloadable: boolean;
      lesson_count: number;
      watched_count: number;
      last_watch: Date | null;
      teacher_name: string | null;
      teacher_slug: string | null;
    }[]
  >`
    select p.id, p.slug, p.title, p.type, g.name as grade_name, g.level as grade_level, s.name as subject_name,
      p.term, p.cover_key, p.is_downloadable, t.display_name as teacher_name, t.slug as teacher_slug,
      (select count(*)::int from lessons l where l.product_id = p.id and l.is_published and l.processing_status = 'ready') as lesson_count,
      (select count(*)::int from lessons l join lesson_progress lp on lp.lesson_id = l.id and lp.user_id = ${userId}
        where l.product_id = p.id and lp.completed) as watched_count,
      (select max(lp.updated_at) from lessons l join lesson_progress lp on lp.lesson_id = l.id and lp.user_id = ${userId}
        where l.product_id = p.id) as last_watch
    from products p
    join grades g on g.id = p.grade_id
    left join subjects s on s.id = p.subject_id
    left join teachers t on t.id = p.teacher_id
    where p.id = any(${ids}::uuid[]) and p.status not in ('draft', 'in_review')
    order by g.level, s.sort_order nulls first, p.sort_order, p.title
  `;
  const expiries = new Map<string, Date | null>();
  for (const id of ids) expiries.set(id, (await accessExpiry(userId, id)).expiresAt);
  const files = await sql<
    { id: string; product_id: string; title: string; page_count: number | null; last_page: number | null; updated_at: Date | null }[]
  >`
    select f.id, f.product_id, f.title, f.page_count, rp.last_page, rp.updated_at
    from product_files f
    left join reading_progress rp on rp.file_id = f.id and rp.user_id = ${userId}
    where f.product_id = any(${ids}::uuid[]) and f.kind = 'main'
    order by f.sort_order, f.created_at
  `;
  const items: LibraryItem[] = [];
  const bundles: { id: string; title: string; slug: string }[] = [];
  for (const p of products) {
    if (p.type === "bundle") {
      bundles.push({ id: p.id, title: p.title, slug: p.slug });
      continue;
    }
    const pf = files.filter((f) => f.product_id === p.id);
    let last = pf.reduce<Date | null>((acc, f) => (f.updated_at && (!acc || f.updated_at > acc) ? f.updated_at : acc), null);
    if (p.last_watch && (!last || p.last_watch > last)) last = p.last_watch;
    // الحاويات التي لا تحتوي دروسًا أو ملفات مباشرة تُعرض كباقات (محتوياتها تظهر منفردة)
    if (isContainerType(p.type) && isVideoType(p.type) && p.lesson_count === 0 && pf.length === 0) {
      bundles.push({ id: p.id, title: p.title, slug: p.slug });
      continue;
    }
    items.push({
      productId: p.id,
      slug: p.slug,
      title: p.title,
      type: p.type,
      gradeName: p.grade_name,
      gradeLevel: p.grade_level,
      subjectName: p.subject_name,
      term: p.term,
      coverKey: p.cover_key,
      isDownloadable: p.is_downloadable,
      files: pf.map((f) => ({ id: f.id, title: f.title, pageCount: f.page_count, lastPage: f.last_page })),
      lessonCount: p.lesson_count,
      watchedCount: p.watched_count,
      teacherName: p.teacher_name,
      teacherSlug: p.teacher_slug,
      expiresAt: expiries.get(p.id) ?? null,
      lastActivity: last,
    });
  }
  return { items, bundles };
}

export type FileAccess =
  | { ok: true; file: { id: string; productId: string; storageKey: string; title: string; kind: "main" | "preview"; sizeBytes: number }; product: { id: string; title: string; isDownloadable: boolean; status: string } }
  | { ok: false; reason: "not_found" | "unauthenticated" | "forbidden" };

/**
 * التحقق من صلاحية الوصول لملف على الخادم (يمنع IDOR):
 * - ملف المعاينة: متاح للجميع إن كان المنتج منشورًا
 * - الملف الأصلي: للمدير، أو للطالب الذي يملك المنتج
 */
export async function checkFileAccess(fileId: string, user: { id: string; role: string } | null): Promise<FileAccess> {
  if (!/^[0-9a-f-]{36}$/i.test(fileId)) return { ok: false, reason: "not_found" };
  const [row] = await sql<
    {
      id: string;
      product_id: string;
      storage_key: string;
      title: string;
      kind: "main" | "preview";
      size_bytes: string | number;
      p_title: string;
      is_downloadable: boolean;
      status: string;
      preview_ok: boolean;
    }[]
  >`
    select f.id, f.product_id, f.storage_key, f.title, f.kind, f.size_bytes, p.title as p_title, p.is_downloadable, p.status,
      ${servablePreviewSql("f")} as preview_ok
    from product_files f join products p on p.id = f.product_id
    where f.id = ${fileId}
  `;
  if (!row) return { ok: false, reason: "not_found" };
  const result = {
    ok: true as const,
    file: { id: row.id, productId: row.product_id, storageKey: row.storage_key, title: row.title, kind: row.kind, sizeBytes: Number(row.size_bytes) },
    product: { id: row.product_id, title: row.p_title, isDownloadable: row.is_downloadable, status: row.status },
  };
  if (row.kind === "preview") {
    // الجمهور يرى معاينة مطابقة للقاعدة فقط. المالك والمعلم صاحب المنتج يفتحانها للمراجعة
    if ((row.status === "published" && row.preview_ok) || user?.role === "admin") return result;
    if (user?.role === "teacher" && (await isTeacherOfProduct(user.id, row.product_id))) return result;
    return { ok: false, reason: "not_found" };
  }
  if (!user) return { ok: false, reason: "unauthenticated" };
  if (user.role === "admin") return result;
  if (user.role === "teacher" && (await isTeacherOfProduct(user.id, row.product_id))) return result;
  if (await hasProductAccess(user.id, row.product_id)) return result;
  return { ok: false, reason: "forbidden" };
}

/** هل المستخدم (بدور معلم) هو معلم هذا المنتج؟ — لمعاينة محتواه داخل اللوحة */
export async function isTeacherOfProduct(userId: string, productId: string, db: Db = sql): Promise<boolean> {
  const rows = await db`
    select 1 from products p join teachers t on t.id = p.teacher_id
    where p.id = ${productId} and t.user_id = ${userId} and t.mode = 'self_managed'
  `;
  return rows.length > 0;
}
