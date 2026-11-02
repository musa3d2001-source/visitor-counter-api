import "server-only";
import { sql, type Db } from "../db";
import { audit } from "../platform/audit";

/**
 * صلاحيات الوصول:
 * الطالب يملك المنتج P إذا كان لديه صلاحية نشطة على P مباشرة،
 * أو صلاحية نشطة على باقة B تحتوي P حاليًا (فيحصل تلقائيًا على ما يُضاف للباقة لاحقًا).
 * عند شراء باقة تُمنح أيضًا صلاحيات لعناصرها الحالية (source='bundle') حتى لا يفقدها
 * الطالب إن أُزيل عنصر من الباقة لاحقًا. القيد unique(user_id, product_id) يمنع التكرار.
 */

export async function hasProductAccess(userId: string, productId: string, db: Db = sql): Promise<boolean> {
  const [row] = await db<{ ok: boolean }[]>`
    select exists (
      select 1 from entitlements e
      where e.user_id = ${userId} and e.revoked_at is null
        and (
          e.product_id = ${productId}
          or exists (select 1 from bundle_items bi where bi.bundle_id = e.product_id and bi.product_id = ${productId})
        )
    ) as ok
  `;
  return Boolean(row?.ok);
}

/** كل معرفات المنتجات التي يملكها الطالب (مباشرة أو عبر باقة) */
export async function accessibleProductIds(userId: string, db: Db = sql): Promise<Set<string>> {
  const rows = await db<{ product_id: string }[]>`
    select e.product_id from entitlements e where e.user_id = ${userId} and e.revoked_at is null
    union
    select bi.product_id from entitlements e
      join bundle_items bi on bi.bundle_id = e.product_id
      where e.user_id = ${userId} and e.revoked_at is null
  `;
  return new Set(rows.map((r) => r.product_id));
}

type GrantInput = {
  userId: string;
  productId: string;
  source: "purchase" | "manual" | "free";
  orderId?: string | null;
  grantedBy?: string | null;
  reason?: string | null;
};

/**
 * منح صلاحية (مع توسيع الباقة لعناصرها). عملية idempotent:
 * إن كانت الصلاحية نشطة لا يحدث شيء، وإن كانت مسحوبة تُعاد تفعيلها.
 * يجب استدعاؤها داخل معاملة عند الربط مع طلب.
 */
export async function grantProduct(db: Db, input: GrantInput): Promise<{ granted: string[] }> {
  const granted: string[] = [];
  const [product] = await db<{ id: string; type: string }[]>`select id, type from products where id = ${input.productId}`;
  if (!product) throw new Error("PRODUCT_NOT_FOUND");

  const upsert = async (productId: string, source: string, viaBundleId: string | null) => {
    const rows = await db<{ id: string }[]>`
      insert into entitlements (user_id, product_id, source, order_id, via_bundle_id, granted_by, grant_reason)
      values (${input.userId}, ${productId}, ${source}, ${input.orderId ?? null}, ${viaBundleId}, ${input.grantedBy ?? null}, ${input.reason ?? null})
      on conflict (user_id, product_id) do update set
        source = excluded.source,
        order_id = excluded.order_id,
        via_bundle_id = excluded.via_bundle_id,
        granted_by = excluded.granted_by,
        grant_reason = excluded.grant_reason,
        granted_at = now(),
        revoked_at = null, revoked_by = null, revoke_reason = null
      where entitlements.revoked_at is not null
      returning id
    `;
    if (rows.length) granted.push(productId);
  };

  await upsert(product.id, input.source, null);
  if (product.type === "bundle") {
    const items = await db<{ product_id: string }[]>`select product_id from bundle_items where bundle_id = ${product.id}`;
    for (const it of items) await upsert(it.product_id, "bundle", product.id);
  }
  return { granted };
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
export async function adminGrant(input: { userId: string; productId: string; adminId: string; reason: string; ip?: string }) {
  return sql.begin(async (tx) => {
    const res = await grantProduct(tx, {
      userId: input.userId,
      productId: input.productId,
      source: "manual",
      grantedBy: input.adminId,
      reason: input.reason,
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
    }[]
  >`
    select p.id, p.slug, p.title, p.type, g.name as grade_name, g.level as grade_level, s.name as subject_name,
      p.term, p.cover_key, p.is_downloadable,
      (select count(*)::int from lessons l where l.product_id = p.id and l.is_published) as lesson_count
    from products p
    join grades g on g.id = p.grade_id
    left join subjects s on s.id = p.subject_id
    where p.id = any(${ids}::uuid[]) and p.status <> 'draft'
    order by g.level, s.sort_order nulls first, p.sort_order, p.title
  `;
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
    const last = pf.reduce<Date | null>((acc, f) => (f.updated_at && (!acc || f.updated_at > acc) ? f.updated_at : acc), null);
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
    }[]
  >`
    select f.id, f.product_id, f.storage_key, f.title, f.kind, f.size_bytes, p.title as p_title, p.is_downloadable, p.status
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
    if (row.status === "published" || user?.role === "admin") return result;
    return { ok: false, reason: "not_found" };
  }
  if (!user) return { ok: false, reason: "unauthenticated" };
  if (user.role === "admin") return result;
  if (await hasProductAccess(user.id, row.product_id)) return result;
  return { ok: false, reason: "forbidden" };
}
