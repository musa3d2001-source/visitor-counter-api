import "server-only";
import { after } from "next/server";
import { sql, type Db } from "../db";
import { reportError } from "../platform/report-error";
import { identityLines, identityOrderSql, stampCacheKey } from "./copy-key";

/**
 * طابور النسخ المختومة المجهزة قبل الفتح (القرار F23): «اختم الملف F للمشتري U». الجدول stamp_jobs في ترحيل 0014.
 * هذا الملف خفيف عمدًا (SQL وبصمة مفتاح النسخة فقط): يستورده منح الصلاحية والاسترداد ورفع الملفات دون أن يحمّلوا pdf-lib.
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

type BuyerCopy = { userId: string; fileId: string; ready: boolean };

/**
 * كل مشترٍ يملك الآن كل ملف من هذه الملفات الرئيسية (مباشرة أو عبر حاوية تضم منتجه بأي عمق، غير مسحوبة ولا منتهية،
 * وحسابه فعال وليس مالكًا)، وهل نسخته الجاهزة هي التي يسلّمها الفتح الآن (البند V4).
 * «جاهزة» تعني مفتاح النسخة نفسه الذي يحسبه التسليم (identityAndCopies): الملف ونسخته وشكل الختم ورقم الطلب الذي
 * يُختم به الآن والبريد. نسخة بشكل ختم قديم، أو برقم طلب أقدم بعد شراء باقة تضم الملف، لا تُحسب جاهزة ولا تمنع تجهيزها.
 * المفتاح بصمة SHA-256 تُحسب هنا بالدالة نفسها (copy-key.ts)، لا بنسخة منها في SQL.
 */
async function buyerCopies(fileIds: string[]): Promise<BuyerCopy[]> {
  if (fileIds.length === 0) return [];
  const rows = await sql<{ user_id: string; file_id: string; email: string; storage_key: string; number: string | null; paid_at: Date | null; keys: string[] | null }[]>`
    with recursive files as (
      select f.id, f.product_id, f.storage_key from product_files f where f.id = any(${fileIds}::uuid[]) and f.kind = 'main'
    ),
    holders(file_id, product_id) as (
      select id, product_id from files
      union
      select h.file_id, bi.bundle_id from holders h join bundle_items bi on bi.product_id = h.product_id
    ),
    pairs as (
      select distinct e.user_id, h.file_id from holders h
      join entitlements e on e.product_id = h.product_id and e.revoked_at is null and (e.expires_at is null or e.expires_at > now())
    )
    select p.user_id, p.file_id, u.email, f.storage_key, ord.number, ord.paid_at,
      (select array_agg(c.cache_key) from stamped_copies c
        where c.user_id = p.user_id and c.file_id = p.file_id and c.file_version = f.storage_key and c.state = 'ready') as keys
    from pairs p
    join files f on f.id = p.file_id
    join users u on u.id = p.user_id and u.is_active and u.anonymized_at is null and u.role <> 'admin'
    left join lateral (${identityOrderSql(sql, sql`p.user_id`, sql`f.product_id`)}) ord on true
  `;
  return rows.map((r) => {
    const identity = identityLines({ id: r.user_id, email: r.email }, r.number ? { number: r.number, paidAt: r.paid_at } : null);
    const key = stampCacheKey({ fileId: r.file_id, fileVersion: r.storage_key, userId: r.user_id, orderNumber: identity.orderNumber, lines: identity.lines });
    return { userId: r.user_id, fileId: r.file_id, ready: (r.keys ?? []).includes(key) };
  });
}

/**
 * تقدم تجهيز نسخ منتج للمالك: كم مشتريًا يملكه الآن (مباشرة أو عبر حاوية)، وكم نسخة يلزم (مشترٍ × ملف رئيسي)،
 * وكم منها جاهز بالنسخة التي يسلّمها الفتح الآن (buyerCopies)، وكم في الطابور، وكم توقف بعد STAMP_JOB_MAX_ATTEMPTS.
 * أعداد فقط، لا أسماء ولا عناوين.
 */
export async function stampPrepProgress(productId: string): Promise<PrepProgress> {
  const fileIds = await mainFileIds(productId);
  if (fileIds.length === 0) return { buyers: 0, wanted: 0, ready: 0, queued: 0, failed: 0 };
  const [pairs, [jobs]] = await Promise.all([
    buyerCopies(fileIds),
    sql<{ queued: number; failed: number }[]>`
      select
        count(*) filter (where j.not_before < now() + make_interval(days => ${PARKED_DAYS}))::int as queued,
        count(*) filter (where j.not_before >= now() + make_interval(days => ${PARKED_DAYS}))::int as failed
      from stamp_jobs j where j.file_id = any(${fileIds}::uuid[])
    `,
  ]);
  return {
    buyers: new Set(pairs.map((p) => p.userId)).size,
    wanted: pairs.length,
    ready: pairs.filter((p) => p.ready).length,
    queued: jobs?.queued ?? 0,
    failed: jobs?.failed ?? 0,
  };
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
 * مهمة موجودة يأخذها مفرّغ الآن تُترك له حرة: المنح قد غيّر هوية الختم (رقم طلب أحدث)، فما يختمه ذلك المفرّغ
 * بالهوية القديمة لا يحذفها حين ينتهي (done يطابق حاملها)، وتأخذها جولة تالية بالهوية الجديدة.
 */
export async function enqueueGrantCopies(db: Db, userId: string, productIds: string[]): Promise<void> {
  if (productIds.length === 0) return;
  await bestEffort(db, "stamp-jobs:enqueue-grant", (tx) => tx`
    insert into stamp_jobs (user_id, file_id, reason)
    select ${userId}, f.id, 'grant' from product_files f
    where f.product_id = any(${productIds}::uuid[]) and f.kind = 'main'
    on conflict (user_id, file_id) do update set not_before = now(), attempts = 0, last_error = null, holder = null, lease_until = null
  `);
}

/**
 * يضع في الطابور نسخ كل مشترٍ يملك الآن هذه الملفات الرئيسية (buyerCopies) وليست له النسخة التي يسلّمها الفتح الآن:
 * لا نسخة، أو نسخة بشكل ختم قديم أو برقم طلب لم يعد هو الذي يُختم به (البند V4). المالك يأخذ الأصل فلا نسخة له.
 * الضغط مرتين لا يكرر شيئًا: مهمة واحدة لكل مشترٍ وملف، وما جُهز لا يعود. مهمة متوقفة بعد محاولاتها تُعاد من الصفر.
 * القاعدة هنا للترتيب فقط: المفرّغ يفحص الملكية والنسخة من جديد قبل كل ختم.
 */
export async function enqueueBuyerCopies(fileIds: string[], reason: Exclude<StampJobReason, "grant">): Promise<number> {
  const missing = (await buyerCopies(fileIds)).filter((p) => !p.ready);
  if (missing.length === 0) return 0;
  // ملف أو حساب حُذف بين القراءة والكتابة يُترك، فلا يُفشل المفتاح الأجنبي الدفعة كلها
  const rows = await sql`
    insert into stamp_jobs (user_id, file_id, reason)
    select t.user_id, t.file_id, ${reason}
    from unnest(${missing.map((p) => p.userId)}::uuid[], ${missing.map((p) => p.fileId)}::uuid[]) as t(user_id, file_id)
    where exists (select 1 from product_files f where f.id = t.file_id) and exists (select 1 from users u where u.id = t.user_id)
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
