import "server-only";
import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { sql, type Db } from "../db";
import { storage, StorageNotFoundError } from "../storage";
import { getSettings } from "../platform/settings";
import { reportError } from "../platform/report-error";
import { exceedsStampLimit, STAMP_MAX_BYTES } from "@/lib/pdf-limits";
import { getPdfPageCount, PdfUnusableError, watermarkPdf } from "./pdf";
import { assertStampCapacity, withStampSlot } from "./stamp-gate";
import { reserveStampMemory, type MemoryLease } from "./stamp-memory";
import { protectedCopySql, stampedCopyBudgetBytes, STAMPED_COPY_IN_USE_MINUTES } from "./copy-store";
import { identityLines, identityOrderSql, stampCacheKey, type Lines } from "./copy-key";

/**
 * تسليم ملفات PDF. الصلاحية والحساب يُفحصان قبل هذا الملف في كل طلب (checkFileAccess و getCurrentUser)،
 * ولا يُخزَّن ناتجهما. ما هنا يقرر فقط كيف تصل البايتات:
 *
 *  - ملف رئيسي لمشترٍ أو معلم والعلامة مفعلة: نسخة مختومة باسمه دائمًا، لا الأصل أبدًا.
 *    النسخة تُجهز غالبًا قبل الفتح (stamp-jobs.ts: بعد الشراء، وبزر المالك، وبالمهمة اليومية)، وإلا خُتمت عند أول فتح
 *    (ضمن حد الختمات الجارية في stamp-gate.ts) وحُفظت في الحاوية الخاصة.
 *  - النسخة المحفوظة تُعاد للمسار { kind: "copy" } فيصدر لها رابطًا موقّعًا لدقيقة واحدة (القرار F22)،
 *    فلا تمر بايتاتها بالدالة. preferStream (قارئ قديم، أو تعذر الرابط) يبثها من التخزين بدل ذلك.
 *  - طلبات متزامنة للملف نفسه من الحساب نفسه على هذه النسخة تنتظر ختمًا واحدًا وتأخذ نتيجته.
 *    على نسخة خادم أخرى يمنع العقد في stamped_copies ختمًا ثانيًا، فيجاب الطلب 429 مع Retry-After.
 *  - المكان المحدود يغطي الختم وحده؛ القراءة من التخزين والرفع إليه خارجه، ويُحسبان على سقف البايتات (stamp-memory.ts).
 *  - المالك، أو العلامة معطلة: الأصل بثًا من التخزين، ولا يُوقَّع له رابط أبدًا.
 *  - المعاينة المجانية: نسخة واحدة في ذاكرة النسخة لكل ملف معاينة، والمتصفح يعيد استعمالها (ترويسات المسار).
 */

// رقم شكل الختم وهوية العلامة ومفتاح النسخة في ملف خفيف (copy-key.ts) يقرؤه عدّاد الجاهزية أيضًا، وتُصدَّر من هنا كما كانت
export { identityLines, stampCacheKey, STAMP_FORMAT_VERSION, type WatermarkIdentity } from "./copy-key";
/** عقد الختم بين نسخ الخادم: أطول من القراءة وانتظار المكان (20 ثانية) والختم (90 ثانية) والحفظ معًا */
export const STAMP_LEASE_SECONDS = 180;
// المساحة وقواعد الإخراج في ملف خفيف بلا pdf-lib (copy-store.ts)، وتُصدَّر من هنا أيضًا لمن اعتاد استيرادها من التسليم
export { protectedCopySql, stampedCopyBudgetBytes, STAMPED_CACHE_BUDGET_BYTES, STAMPED_COPY_IDLE_DAYS, STAMPED_COPY_IN_USE_MINUTES, STAMPED_COPY_PROTECT_DAYS } from "./copy-store";
/** وقت آخر استعمال يُحدَّث إن مضت عليه هذه المدة: كتابة واحدة لكل نسخة في كل 10 دقائق على الأكثر */
const TOUCH_AFTER_MINUTES = 10;
/** انتظار نسخة خادم أخرى تختم الملف نفسه للحساب نفسه */
export const STAMP_IN_PROGRESS_RETRY_SECONDS = 5;
const MAX_JOINERS = 10;
/** نسخة تُبث من الذاكرة لا تبقى محسوبة أطول من أقصى مدة للدالة (300 ثانية) مع هامش، ولو لم يُغلق بثها */
const STREAM_MEMORY_BACKSTOP_MS = 330_000;

/**
 * حدود فتح الملفات في كل 10 دقائق:
 * - للحساب: 40 فتحًا سُلّم فيه ملف. القارئ يطلب الملف مرة لكل فتح، والتنزيل مرة؛ قارئ أمين على جهازين لا يصل إليها.
 *   الحد للحساب لا للعنوان، فصف كامل خلف عنوان واحد لا يُقفل.
 * - رد «مشغول» أو «نسختك قيد التجهيز» لا يُحتسب من الأربعين (البند R010): القارئ يعيد المحاولة وحده أثناء الضغط،
 *   ولا يصح أن يُقفل الطالب بسبب انشغالنا. لهذه الإعادات سقف خاص أعلى، retriesPerAccount، حتى لا تصير بابًا بلا حد.
 * - للزائر بلا حساب (المعاينات وحدها متاحة له): 600 لكل عنوان. لا حساب هنا نربط به، والعنوان الواحد قد يكون فصلًا كاملًا
 *   أو شركة اتصالات خلف عنوان مشترك، والمعاينة عامة والمتصفح يعيد استعمالها فلا يطلبها مجددًا.
 */
export const FILE_OPEN_LIMITS = { perAccount: 40, perAnonymousIp: 600, retriesPerAccount: 200, windowSeconds: 10 * 60 } as const;

/** ختم الملف نفسه للحساب نفسه يجري الآن على نسخة خادم أخرى */
export class StampInProgressError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super("the same copy is being stamped elsewhere");
    this.name = "StampInProgressError";
  }
}

/** الملف أكبر من حد الختم (lib/pdf-limits.ts): لا يُختم ولا يُسلَّم أصله لمشترٍ */
export class OverStampLimitError extends PdfUnusableError {
  constructor() {
    super("over_limit");
    this.name = "OverStampLimitError";
  }
}

export type DeliverableFile = {
  id: string;
  productId: string;
  storageKey: string;
  kind: "main" | "preview";
  sizeBytes: number;
  pageCount: number | null;
  checkStatus: string;
};

export type DeliveryUser = { id: string; email: string; role: string };

/** بايتات تمر بالدالة: المعاينة، وأصل المالك، ونسخة لم تُحفظ، وقارئ لا يتبع الروابط */
export type PdfStream = { kind: "stream"; body: ReadableStream<Uint8Array>; size: number | null };
/** نسخة مختومة محفوظة لهذا المشتري: المسار يصدر لها رابطًا موقّعًا قصير العمر بعد تسجيل الوصول */
export type PdfCopy = { kind: "copy"; objectKey: string; size: number | null };
export type PdfDelivery = PdfStream | PdfCopy;

/**
 * تحويل البايتات إلى Stream (الاستجابات المتدفقة لا تخضع لحد 4.5MB في Vercel).
 * onDone مرة واحدة: عند آخر قطعة أو عند إلغاء القارئ، فيُحرَّر ما حُسب لهذه البايتات في الذاكرة.
 */
export function bytesToStream(bytes: Uint8Array, chunkSize = 256 * 1024, onDone?: () => void): ReadableStream<Uint8Array> {
  let offset = 0;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    onDone?.();
  };
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        finish();
        return;
      }
      const end = Math.min(offset + chunkSize, bytes.length);
      controller.enqueue(bytes.subarray(offset, end));
      offset = end;
    },
    cancel() {
      finish();
    },
  });
}

const fromBytes = (bytes: Uint8Array): PdfStream => ({ kind: "stream", body: bytesToStream(bytes), size: bytes.length });

async function streamObject(key: string): Promise<PdfStream> {
  const { stream, size } = await storage().readStream("private", key);
  return { kind: "stream", body: stream, size };
}

// ---------------------------------------------------------------------------- المعاينة

/** نسخة واحدة لكل ملف معاينة في ذاكرة هذه النسخة. المفتاح storage_key، ومعاينة جديدة لها مفتاح جديد */
export const PREVIEW_MEMORY = { maxItemBytes: 8 * 1024 * 1024, maxTotalBytes: 48 * 1024 * 1024 } as const;
const previewCache = new Map<string, Uint8Array>();
const previewLoads = new Map<string, Promise<Uint8Array>>();
let previewTotal = 0;

export function previewMemoryState() {
  return { items: previewCache.size, bytes: previewTotal };
}

export function clearPreviewMemoryForTests() {
  previewCache.clear();
  previewLoads.clear();
  previewTotal = 0;
}

function rememberPreview(key: string, bytes: Uint8Array) {
  if (previewCache.has(key)) return;
  previewCache.set(key, bytes);
  previewTotal += bytes.length;
  for (const [oldKey, oldBytes] of previewCache) {
    if (previewTotal <= PREVIEW_MEMORY.maxTotalBytes) break;
    previewCache.delete(oldKey);
    previewTotal -= oldBytes.length;
  }
}

async function previewBody(file: DeliverableFile): Promise<PdfStream> {
  if (file.sizeBytes > PREVIEW_MEMORY.maxItemBytes) return streamObject(file.storageKey);
  const cached = previewCache.get(file.storageKey);
  if (cached) {
    // الأحدث استعمالًا في آخر الترتيب، فالإخراج يبدأ بالأقدم
    previewCache.delete(file.storageKey);
    previewCache.set(file.storageKey, cached);
    return fromBytes(cached);
  }
  let load = previewLoads.get(file.storageKey);
  if (!load) {
    load = storage()
      .read("private", file.storageKey)
      .then((bytes) => {
        if (bytes.length <= PREVIEW_MEMORY.maxItemBytes) rememberPreview(file.storageKey, bytes);
        return bytes;
      })
      .finally(() => previewLoads.delete(file.storageKey));
    previewLoads.set(file.storageKey, load);
  }
  return fromBytes(await load);
}

// ---------------------------------------------------------------------------- النسخة المختومة

type CopyRow = { id: string; cacheKey: string; objectKey: string; size: number | null; stale: boolean };

/**
 * هوية العلامة والنسخ المحفوظة لهذا الحساب وهذا الملف بنسخته الحالية، وهل له مهمة تجهيز في الطابور، في أمر واحد.
 * الطلب الذي يُختم به: أحدث طلب منح صلاحية على المنتج نفسه أو على باقة تضمه مباشرة، ولم تُسحب صلاحيته (identityOrderSql،
 * القاعدة نفسها التي يعدّ بها المالك النسخ الجاهزة).
 */
export async function identityAndCopies(user: DeliveryUser, file: DeliverableFile) {
  const [row] = await sql<{ number: string | null; paid_at: Date | null; copies: CopyRow[] | null; queued: boolean }[]>`
    select ord.number, ord.paid_at, cp.copies,
      exists (select 1 from stamp_jobs j where j.user_id = ${user.id} and j.file_id = ${file.id}) as queued
    from (select 1) as one
    left join lateral (${identityOrderSql(sql, user.id, file.productId)}) ord on true
    left join lateral (
      select json_agg(json_build_object(
        'id', c.id, 'cacheKey', c.cache_key, 'objectKey', c.object_key, 'size', c.size_bytes,
        'stale', c.last_used_at < now() - make_interval(mins => ${TOUCH_AFTER_MINUTES})
      )) as copies
      from stamped_copies c
      where c.user_id = ${user.id} and c.file_id = ${file.id} and c.file_version = ${file.storageKey} and c.state = 'ready'
    ) cp on true
  `;
  const identity = identityLines(user, row?.number ? { number: row.number, paidAt: row.paid_at } : null);
  const key = stampCacheKey({ fileId: file.id, fileVersion: file.storageKey, userId: user.id, orderNumber: identity.orderNumber, lines: identity.lines });
  const hit = (row?.copies ?? []).find((c) => c.cacheKey === key) ?? null;
  return { identity, key, hit: hit ? { ...hit, size: hit.size === null ? null : Number(hit.size) } : null, queued: row?.queued === true };
}

type Claim = { kind: "mine"; id: string } | { kind: "ready"; objectKey: string; size: number | null } | { kind: "busy"; retryAfterSeconds: number };

/**
 * عقد الختم بين نسخ الخادم. نسخة ماتت أثناء الختم تترك عقدًا منتهيًا: يُعلَّم للحذف (مع كائن ربما رفعته)
 * ثم يأخذ هذا الطلب عقدًا جديدًا. الفهرس الفريد على cache_key يضمن ختمًا واحدًا حيًا.
 */
async function claimStamping(key: string, user: DeliveryUser, file: DeliverableFile, token: string, objectKey: string): Promise<Claim> {
  await sql`update stamped_copies set state = 'doomed' where cache_key = ${key} and state = 'stamping' and lease_until < now()`;
  const [mine] = await sql<{ id: string }[]>`
    insert into stamped_copies (cache_key, user_id, file_id, file_version, object_key, state, holder, lease_until)
    values (${key}, ${user.id}, ${file.id}, ${file.storageKey}, ${objectKey}, 'stamping', ${token}, now() + make_interval(secs => ${STAMP_LEASE_SECONDS}))
    on conflict (cache_key) where state <> 'doomed' do nothing
    returning id
  `;
  if (mine) return { kind: "mine", id: mine.id };
  const [live] = await sql<{ state: string; object_key: string; size_bytes: string | null; seconds: number | null }[]>`
    select state, object_key, size_bytes::text, ceil(extract(epoch from lease_until - now()))::int as seconds
    from stamped_copies where cache_key = ${key} and state <> 'doomed'
  `;
  if (live?.state === "ready") return { kind: "ready", objectKey: live.object_key, size: live.size_bytes === null ? null : Number(live.size_bytes) };
  return { kind: "busy", retryAfterSeconds: Math.min(30, Math.max(STAMP_IN_PROGRESS_RETRY_SECONDS, live?.seconds ?? STAMP_IN_PROGRESS_RETRY_SECONDS)) };
}

/**
 * ختم لم يكتمل حفظه: الصف يُعلَّم للحذف ويُترك بلا حامل، فتحذف الجولة التالية كائنه إن كان قد رُفع (البند R011).
 * فشل هذا الأمر نفسه لا يترك شيئًا للأبد: التنظيف اليومي يعلّم عقد الختم المنتهي منذ ساعة، والجولة تحذف ما انتهى عقده.
 */
async function releaseClaim(claimId: string, token: string) {
  await sql`update stamped_copies set state = 'doomed', holder = null, lease_until = null where id = ${claimId} and holder = ${token}`.catch((err) =>
    reportError("files:stamped-copy-release", err),
  );
}

/**
 * يفسح مكانًا لنسخة جديدة حين تمتلئ المساحة (القرار F24، البند R009): يعلّم الأقدم استعمالًا للحذف حتى يتسع.
 * الترتيب: أولًا ما ليس محميًا، ثم ما جُهز في آخر ٧ أيام لمشترٍ ما زال يملك المنتج، والأقدم استعمالًا أولًا في كل منهما.
 * لا يمس نسخة فُتحت في آخر ربع ساعة (قد يكون رابطها في يد الطالب الآن). إن لم يكفِ ما يجوز حذفه تُحفظ النسخة الجديدة
 * مع ذلك: المساحة سقف للتنظيف لا سبب لختم الملف من جديد في كل فتح. نسختان تُحفظان في اللحظة نفسها قد تتجاوزان السقف
 * قليلًا، والتنظيف اليومي ينزل إلى ٩٠٪ منه.
 */
async function makeRoom(size: number): Promise<number> {
  const budget = stampedCopyBudgetBytes();
  const [{ used }] = await sql<{ used: string }[]>`select coalesce(sum(size_bytes), 0)::text as used from stamped_copies where state = 'ready'`;
  const over = Number(used) + size - budget;
  if (over <= 0) return 0;
  const evicted = await sql`
    with victims as materialized (
      select id from (
        select c.id, c.size_bytes,
          sum(c.size_bytes) over (order by c.protected, c.last_used_at, c.id) as freed
        from (
          select c.id, c.size_bytes, c.last_used_at, ${protectedCopySql()} as protected
          from stamped_copies c
          where c.state = 'ready' and c.size_bytes is not null and c.last_used_at < now() - make_interval(mins => ${STAMPED_COPY_IN_USE_MINUTES})
        ) c
      ) ranked
      where freed - size_bytes < ${over}
    )
    update stamped_copies c set state = 'doomed' from victims v where c.id = v.id and c.state = 'ready'
  `;
  if (evicted.count > 0) sweepSoon(evicted.count);
  return evicted.count;
}

/** حذف كائنات ما أُخرج للتو بعد الرد، لا أثناءه. ما تعثر تكمله المهمة اليومية */
function sweepSoon(limit: number) {
  const sweep = () => sweepDoomedCopies(Math.min(500, limit)).catch((err) => reportError("files:stamped-copy-evict-sweep", err));
  try {
    after(sweep);
  } catch {
    // خارج سياق طلب (المهمة اليومية، اختبار)
    void sweep();
  }
}

/**
 * يحفظ النسخة ويعلّمها جاهزة. يُعلَّم الصف جاهزًا فقط إن كان ما زال عقدنا ولم يُعلَّم للحذف، وإن كان البريد المختوم
 * ما زال بريد الحساب والحساب فعالًا (البند R011): غير ذلك يُحذف الكائن الذي رُفع للتو، فلا تبقى نسخة لا يجدها وعد الحذف.
 * أي تعثر في الحفظ لا يمنع تسليم ما خُتم: الحفظ تسريع لا شرط.
 */
async function keepCopy(claimId: string, token: string, objectKey: string, bytes: Uint8Array, stampedEmail: string): Promise<boolean> {
  await makeRoom(bytes.length).catch((err) => reportError("files:stamped-copy-evict", err));
  try {
    // نسخة شخصية: لا يحفظها متصفح ولا شبكة بين رابط وآخر
    await storage().put("private", objectKey, bytes, "application/pdf", { cacheSeconds: 0 });
  } catch (err) {
    await reportError("files:stamped-copy-store", err);
    return false;
  }
  const done = await sql`
    update stamped_copies c set state = 'ready', size_bytes = ${bytes.length}, holder = null, lease_until = null, last_used_at = now()
    where c.id = ${claimId} and c.holder = ${token} and c.state = 'stamping'
      and exists (select 1 from users u where u.id = c.user_id and u.email = ${stampedEmail} and u.is_active and u.anonymized_at is null)
  `;
  if (done.count === 1) return true;
  await storage()
    .removeMany("private", [objectKey])
    .catch((err) => reportError("files:stamped-copy-orphan", err));
  return false;
}

/** بايتات نسخة لم تُحفظ، يقرؤها صاحب الطلب ومن انضم إليه على هذه النسخة. تبقى محسوبة حتى يُغلق آخر بث أو يُلغى */
type SharedBytes = { size: number; open(): ReadableStream<Uint8Array> };

function shareBytes(bytes: Uint8Array, lease: MemoryLease): SharedBytes {
  let readers = 0;
  let opening = true;
  const settle = () => {
    if (opening || readers > 0) return;
    clearTimeout(backstop);
    lease.release();
  };
  const backstop = setTimeout(() => lease.release(), STREAM_MEMORY_BACKSTOP_MS);
  backstop.unref?.();
  // من انتظر الختم نفسه يفتح بثه في المهمة الجارية نفسها (بلا انتظار جديد)، فلا يُحرَّر الحساب قبل أن يبدؤوا
  setImmediate(() => {
    opening = false;
    settle();
  });
  return {
    size: bytes.length,
    open() {
      readers++;
      return bytesToStream(bytes, 256 * 1024, () => {
        readers--;
        settle();
      });
    },
  };
}

type Produced = { kind: "kept"; objectKey: string; size: number | null } | { kind: "bytes"; shared: SharedBytes };

/**
 * يختم نسخة هذا المشتري ويحفظها (البندان R007 و R016):
 *  1) حجز البايتات على سقف النسخة، وإلا «مشغول» قبل أي قراءة. 2) عقد الختم بين النسخ.
 *  3) قراءة الأصل من التخزين خارج المكان المحدود (أو أصل قرأته دفعة التجهيز مرة لكل المشترين).
 *  4) الختم وحده داخل المكان. 5) الحفظ خارجه. نسخة حُفظت تعود مفتاحًا لا بايتات، فلا تبقى في الذاكرة أثناء تنزيلها.
 * clearQueuedJob: الفتح وجد مهمة تجهيزه في الطابور فأنجزها بنفسه، فتُحذف بعد الحفظ.
 */
export async function produceCopy(
  key: string,
  user: DeliveryUser,
  file: DeliverableFile,
  lines: Lines,
  opts: { original?: Uint8Array; budgetMs?: number; clearQueuedJob?: boolean } = {},
): Promise<Produced> {
  assertStampCapacity();
  const lease = reserveStampMemory((opts.original ? 0 : file.sizeBytes) + file.sizeBytes);
  const token = randomUUID();
  const objectKey = `stamped/${randomUUID()}.pdf`;
  let claimId: string | null = null;
  let handedOver = false;
  try {
    const claim = await claimStamping(key, user, file, token, objectKey);
    if (claim.kind === "ready") return { kind: "kept", objectKey: claim.objectKey, size: claim.size };
    if (claim.kind === "busy") throw new StampInProgressError(claim.retryAfterSeconds);
    claimId = claim.id;
    let original: Uint8Array | null = opts.original ?? (await storage().read("private", file.storageKey));
    if (original.length > STAMP_MAX_BYTES) throw new OverStampLimitError();
    if (!opts.original) lease.resize(original.length * 2);
    const stamped = await withStampSlot(() => watermarkPdf(original!, lines, opts.budgetMs));
    // الأصل لم يعد لازمًا: لا يبقى محسوبًا (ولا مرجعًا) أثناء الرفع
    original = null;
    lease.resize(stamped.length);
    if (await keepCopy(claimId, token, objectKey, stamped, user.email)) {
      claimId = null;
      if (opts.clearQueuedJob) {
        await sql`delete from stamp_jobs where user_id = ${user.id} and file_id = ${file.id} and (holder is null or lease_until < now())`.catch((err) =>
          reportError("files:stamp-job-clear", err),
        );
      }
      return { kind: "kept", objectKey, size: stamped.length };
    }
    // العقد يُترك قبل تسليم البايتات: لا انتظار بعد shareBytes حتى يفتح الطالب بثه، وإلا حُرر حسابها قبل أن يبدأ
    await releaseClaim(claimId, token);
    claimId = null;
    handedOver = true;
    return { kind: "bytes", shared: shareBytes(stamped, lease) };
  } finally {
    if (!handedOver) lease.release();
    if (claimId) await releaseClaim(claimId, token);
  }
}

/** ختم واحد لكل مفتاح على هذه النسخة: الطلبات المكررة تنتظر نتيجته */
const inflight = new Map<string, { promise: Promise<Produced>; joiners: number }>();

export function stampingInFlight() {
  return inflight.size;
}

async function stampOnce(key: string, user: DeliveryUser, file: DeliverableFile, lines: Lines, clearQueuedJob: boolean): Promise<Produced> {
  const running = inflight.get(key);
  if (running) {
    if (running.joiners >= MAX_JOINERS) throw new StampInProgressError(STAMP_IN_PROGRESS_RETRY_SECONDS);
    running.joiners++;
    return running.promise;
  }
  const promise = produceCopy(key, user, file, lines, { clearQueuedJob }).finally(() => inflight.delete(key));
  inflight.set(key, { promise, joiners: 0 });
  return promise;
}

async function stampedDelivery(user: DeliveryUser, file: DeliverableFile, preferStream: boolean): Promise<PdfDelivery> {
  // ملف فوق الحد لا يُقرأ أصلًا. صفحاته تُعرف بعد الفتح أيضًا (watermarkPdf يرفض ما زاد)
  if (exceedsStampLimit(file)) throw new OverStampLimitError();
  const { identity, key, hit, queued } = await identityAndCopies(user, file);
  if (hit) {
    if (hit.stale) await sql`update stamped_copies set last_used_at = now() where id = ${hit.id}`.catch((err) => reportError("files:stamped-copy-touch", err));
    // النسخة الجاهزة لا تُختم ولا تُقرأ هنا: المسار يصدر لها رابطًا بعد تسجيل الوصول
    if (!preferStream) return { kind: "copy", objectKey: hit.objectKey, size: hit.size };
    try {
      return await streamObject(hit.objectKey);
    } catch (err) {
      if (!(err instanceof StorageNotFoundError)) throw err;
      // الكائن ضاع من التخزين: يُعلَّم الصف ويُختم من جديد
      await sql`update stamped_copies set state = 'doomed' where id = ${hit.id}`;
    }
  }
  const produced = await stampOnce(key, user, file, identity.lines, queued);
  // يُفتح البث فورًا بلا انتظار بينه وبين الختم (shareBytes)
  if (produced.kind === "bytes") return { kind: "stream", body: produced.shared.open(), size: produced.shared.size };
  if (!preferStream) return { kind: "copy", objectKey: produced.objectKey, size: produced.size };
  return streamObject(produced.objectKey);
}

// ---------------------------------------------------------------------------- نقطة الدخول

/**
 * يقرر ما يُسلَّم بعد أن فحص المسار الصلاحية. لا يعيد أصل ملف رئيسي لمشترٍ والعلامة مفعلة، أبدًا.
 * preferStream: بث النسخة المحفوظة من التخزين عبر الدالة بدل { kind: "copy" } (قارئ قديم، أو تعذر الرابط).
 */
export async function openDeliverablePdf(file: DeliverableFile, user: DeliveryUser | null, opts: { preferStream?: boolean } = {}): Promise<PdfDelivery> {
  if (file.kind === "preview") return previewBody(file);
  if (!user) throw new Error("main file without a user");
  if (user.role === "admin") return streamObject(file.storageKey);
  const settings = await getSettings();
  if (!settings.watermark_enabled) {
    // بلا ختم لا يمر الملف بأي فحص: ملف قديم محمي بكلمة مرور يُكتشف هنا، فيُعلَّم ويقال للطالب الصدق
    if (file.checkStatus === "unchecked" && file.sizeBytes <= STAMP_MAX_BYTES) {
      const lease = reserveStampMemory(file.sizeBytes);
      try {
        const bytes = await storage().read("private", file.storageKey);
        await withStampSlot(() => getPdfPageCount(bytes));
      } finally {
        lease.release();
      }
    }
    return streamObject(file.storageKey);
  }
  return stampedDelivery(user, file, opts.preferStream === true);
}

// ---------------------------------------------------------------------------- الحذف

/**
 * يعلّم نسخ حساب للحذف ويلغي مهام تجهيزها (حذف بيانات الطالب). داخل معاملة الحذف نفسها، فلا تُستعمل بعدها أبدًا،
 * والكائنات تُحذف بعد المعاملة (sweepDoomedCopies) أو في التنظيف اليومي إن تعثر ذلك.
 */
export async function doomUserCopies(userId: string, db: Db = sql): Promise<number> {
  await db`delete from stamp_jobs where user_id = ${userId}`;
  return (await db`update stamped_copies set state = 'doomed' where user_id = ${userId} and state <> 'doomed'`).count;
}

/** نسخ ملف حُذف أو استُبدل: لا يمكن أن تُستعمل بعد الآن. مهامه تُحذف مع صف الملف نفسه (on delete cascade) */
export async function doomFileCopies(fileIds: string[]): Promise<number> {
  if (fileIds.length === 0) return 0;
  return (await sql`update stamped_copies set state = 'doomed' where file_id = any(${fileIds}::uuid[]) and state <> 'doomed'`).count;
}

/**
 * يحذف كائنات النسخ المعلَّمة ثم صفوفها. ما فشل حذفه يبقى معلَّمًا للجولة التالية.
 * صف عليه عقد ختم حي لا يُمس (البند R011): الختم قد يرفع كائنه بعد هذه الجولة، فيُترك حتى يتخلى عنه صاحبه
 * (releaseClaim يزيل الحامل) أو ينتهي عقده، ثم تحذفه جولة لاحقة مع كائنه.
 */
export async function sweepDoomedCopies(limit = 100): Promise<number> {
  const rows = await sql<{ id: string; object_key: string }[]>`
    select id, object_key from stamped_copies
    where state = 'doomed' and (holder is null or lease_until is null or lease_until < now())
    order by last_used_at limit ${limit}
  `;
  if (rows.length === 0) return 0;
  await storage().removeMany(
    "private",
    rows.map((r) => r.object_key),
  );
  const ids = rows.map((r) => r.id);
  return (await sql`delete from stamped_copies where id = any(${ids}::uuid[]) and state = 'doomed'`).count;
}
