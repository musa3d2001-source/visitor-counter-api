import "server-only";
import { after } from "next/server";
import { sql, type Db } from "../db";
import { reportError } from "../platform/report-error";

/**
 * طابور النسخ المختومة المجهزة قبل الفتح (القرار F23): «اختم الملف F للمشتري U». الجدول stamp_jobs في ترحيل 0014.
 * هذا الملف خفيف عمدًا (SQL فقط): يستورده منح الصلاحية والاسترداد ورفع الملفات دون أن يحمّلوا pdf-lib.
 * التفريغ نفسه في stamp-jobs.ts ويُحمَّل عند الحاجة فقط.
 */

export type StampJobReason = "grant" | "new_file" | "owner";

/** ما يُفرَّغ: مهام مشترٍ واحد (بعد منحه)، أو ملفات بعينها (بعد رفعها أو بزر المالك)، أو الكل (المهمة اليومية) */
export type DrainScope = { userId?: string; fileIds?: string[] };

/**
 * ميزانيات التفريغ بعد الرد. after() يعمل داخل maxDuration للمسار نفسه، فالميزانية مع أطول عمل قبل الرد تبقى دونها:
 *  - afterGrant: الإشعار وعودة الدفع وصفحتا الدفع لها 60 ثانية، وأطول إجراء دفع 45 ثانية (PAYMENT_ACTION_BUDGET_MS)، فيبقى 10.
 *  - afterUpload: تأكيد الرفع 120 ثانية، وفيه قراءة الملف وختم تجريبي (30) ومعاينة (30)، فيبقى 40.
 *  - ownerButton و daily: صفحة المنتج ووظيفة prepare-copies لهما 300 ثانية، وعملهما قبل الرد قصير.
 * كل ختم في التفريغ يأخذ ما بقي من الميزانية مهلةً له، ولا يبدأ ختم بأقل من 5 ثوانٍ، فلا يقطع Vercel ختمًا في منتصفه.
 * مسار قُطع مع ذلك يترك عقدًا ينتهي وحده (عقد المهمة 300 ثانية، وعقد الختم 180)، ثم تأخذها جولة أخرى أو فتح الطالب.
 */
export const DRAIN_BUDGET_MS = { afterGrant: 10_000, afterUpload: 40_000, ownerButton: 200_000, daily: 200_000 } as const;

/** بعد هذه المحاولات تتوقف المهمة وتظهر للمالك «تعذر تجهيزها»، ولا تُعاد وحدها. زر المالك يعيدها */
export const STAMP_JOB_MAX_ATTEMPTS = 5;
/** المهمة المتوقفة: موعدها بعد هذا وأكثر، فلا يأخذها مفرّغ */
export const PARKED_DAYS = 365;

export type PrepProgress = { buyers: number; wanted: number; ready: number; queued: number; failed: number };

/**
 * تقدم تجهيز نسخ منتج للمالك: كم مشتريًا يملكه الآن (مباشرة أو عبر حاوية)، وكم نسخة يلزم (مشترٍ × ملف رئيسي)،
 * وكم منها جاهز بنسخة الملف الحالية، وكم في الطابور، وكم توقف بعد STAMP_JOB_MAX_ATTEMPTS. أعداد فقط، لا أسماء ولا عناوين.
 */
export async function stampPrepProgress(productId: string): Promise<PrepProgress> {
  const [row] = await sql<PrepProgress[]>`
    with recursive files as (
      select id, storage_key from product_files where product_id = ${productId} and kind = 'main'
    ),
    holders(product_id) as (
      select ${productId}::uuid
      union
      select bi.bundle_id from holders h join bundle_items bi on bi.product_id = h.product_id
    ),
    buyers as (
      select distinct e.user_id from holders h
      join entitlements e on e.product_id = h.product_id and e.revoked_at is null and (e.expires_at is null or e.expires_at > now())
      join users u on u.id = e.user_id and u.is_active and u.anonymized_at is null and u.role <> 'admin'
    )
    select
      (select count(*)::int from buyers) as buyers,
      (select count(*)::int from buyers, files) as wanted,
      (select count(distinct (c.user_id, c.file_id))::int from stamped_copies c join files f on f.id = c.file_id and c.file_version = f.storage_key
        where c.state = 'ready' and c.user_id in (select user_id from buyers)) as ready,
      (select count(*)::int from stamp_jobs j where j.file_id in (select id from files) and j.not_before < now() + make_interval(days => ${PARKED_DAYS})) as queued,
      (select count(*)::int from stamp_jobs j where j.file_id in (select id from files) and j.not_before >= now() + make_interval(days => ${PARKED_DAYS})) as failed
  `;
  return row ?? { buyers: 0, wanted: 0, ready: 0, queued: 0, failed: 0 };
}

type Savepointable = Db & { savepoint?: <T>(cb: (tx: Db) => Promise<T>) => Promise<T> };

/**
 * داخل معاملة المنح أو السحب، في نقطة حفظ: تعثر الطابور لا يُفشل منحًا ولا استردادًا أبدًا، ويُسجل للمالك.
 * بلا الطابور يبقى كل شيء كما كان: الفتح يختم عند الطلب.
 */
async function bestEffort(db: Db, label: string, work: (tx: Db) => Promise<unknown>): Promise<void> {
  const tx = db as Savepointable;
  try {
    if (typeof tx.savepoint === "function") await tx.savepoint((sp) => work(sp));
    else await work(db);
  } catch (err) {
    await reportError(label, err);
  }
}

/**
 * يضع في الطابور نسخة كل ملف رئيسي من هذه المنتجات لهذا المشتري، في معاملة المنح نفسها: لا تضيع مهمة لمنح ثبت،
 * ولا تبقى مهمة لمنح تراجع. منح مكرر (إعادة إشعار الدفع) لا يصل هنا لأن grantProduct لا يعيد ما لم يتغير.
 */
export async function enqueueGrantCopies(db: Db, userId: string, productIds: string[]): Promise<void> {
  if (productIds.length === 0) return;
  await bestEffort(db, "stamp-jobs:enqueue-grant", (tx) => tx`
    insert into stamp_jobs (user_id, file_id, reason)
    select ${userId}, f.id, 'grant' from product_files f
    where f.product_id = any(${productIds}::uuid[]) and f.kind = 'main'
    on conflict (user_id, file_id) do update set not_before = now(), attempts = 0, last_error = null
  `);
}

/**
 * يضع في الطابور نسخ كل مشترٍ يملك الآن هذه الملفات الرئيسية: مباشرة أو عبر حاوية تضم منتجها بأي عمق،
 * غير مسحوبة ولا منتهية، وحسابه فعال، وليست له نسخة جاهزة من هذا الملف بنسخته الحالية. المالك يأخذ الأصل فلا نسخة له.
 * الضغط مرتين لا يكرر شيئًا: مهمة واحدة لكل مشترٍ وملف، وما جُهز لا يعود. مهمة متوقفة بعد محاولاتها تُعاد من الصفر.
 * القاعدة هنا للترتيب فقط: المفرّغ يفحص الملكية من جديد (hasProductAccess) قبل كل ختم.
 */
export async function enqueueBuyerCopies(fileIds: string[], reason: Exclude<StampJobReason, "grant">): Promise<number> {
  if (fileIds.length === 0) return 0;
  const rows = await sql`
    with recursive holders(file_id, storage_key, product_id) as (
      select f.id, f.storage_key, f.product_id from product_files f where f.id = any(${fileIds}::uuid[]) and f.kind = 'main'
      union
      select h.file_id, h.storage_key, bi.bundle_id from holders h join bundle_items bi on bi.product_id = h.product_id
    )
    insert into stamp_jobs (user_id, file_id, reason)
    select distinct e.user_id, h.file_id, ${reason}
    from holders h
    join entitlements e on e.product_id = h.product_id and e.revoked_at is null and (e.expires_at is null or e.expires_at > now())
    join users u on u.id = e.user_id and u.is_active and u.anonymized_at is null and u.role <> 'admin'
    where not exists (
      select 1 from stamped_copies c where c.user_id = e.user_id and c.file_id = h.file_id and c.file_version = h.storage_key and c.state = 'ready'
    )
    on conflict (user_id, file_id) do update set reason = excluded.reason, not_before = now(), attempts = 0, last_error = null
  `;
  return rows.count;
}

/** الملفات الرئيسية لمنتج: لزر المالك */
export async function mainFileIds(productId: string): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`select id from product_files where product_id = ${productId} and kind = 'main'`;
  return rows.map((r) => r.id);
}

/**
 * سحب صلاحية (استرداد أو سحب يدوي): مهام تجهيز نسخه من هذه المنتجات تُلغى، ونسخه المختومة منها تُعلَّم للحذف
 * (تحذف كائناتها جولة الحذف بعد انتهاء أي ختم جارٍ عليها). في معاملة السحب نفسها، بأفضل جهد.
 * من بقي يملك المنتج من طريق آخر (باقة) يُختم له من جديد عند فتحه.
 */
export async function forgetRevokedCopies(db: Db, userId: string, productIds: string[]): Promise<void> {
  if (productIds.length === 0) return;
  await bestEffort(db, "stamp-jobs:forget-revoked", async (tx) => {
    await tx`delete from stamp_jobs j using product_files f where f.id = j.file_id and j.user_id = ${userId} and f.product_id = any(${productIds}::uuid[])`;
    await tx`
      update stamped_copies c set state = 'doomed' from product_files f
      where f.id = c.file_id and c.user_id = ${userId} and f.product_id = any(${productIds}::uuid[]) and c.state <> 'doomed'
    `;
  });
}

/**
 * يفرّغ الطابور بعد الرد، داخل مهلة المسار الذي جدوله (after في Next.js يعمل حتى maxDuration للمسار:
 * node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md).
 * خارج سياق طلب (سكربت، اختبار) لا يفعل شيئًا: المهمة اليومية وفتح الطالب نفسه يأخذان المهام.
 */
export function scheduleStampDrain(scope: DrainScope, budgetMs: number): void {
  // طلب واحد قد يمنح عدة منتجات (طلب فيه أكثر من مذكرة): تفريغ واحد للنطاق نفسه يكفي، فلا تتزاحم مفرّغات على المهام نفسها
  const key = JSON.stringify([scope.userId ?? null, scope.fileIds ?? null]);
  if (pendingDrains.has(key)) return;
  const run = async () => {
    try {
      const { drainStampJobs } = await import("./stamp-jobs");
      await drainStampJobs({ ...scope, budgetMs });
    } catch (err) {
      await reportError("stamp-jobs:drain", err);
    } finally {
      pendingDrains.delete(key);
    }
  };
  try {
    after(run);
    pendingDrains.add(key);
  } catch {
    // لا سياق طلب
  }
}

const pendingDrains = new Set<string>();
