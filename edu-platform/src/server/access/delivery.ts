import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { sql, type Db } from "../db";
import { env } from "../env";
import { storage, StorageNotFoundError } from "../storage";
import { getSettings } from "../platform/settings";
import { reportError } from "../platform/report-error";
import { exceedsStampLimit, STAMP_MAX_BYTES } from "@/lib/pdf-limits";
import { getPdfPageCount, PdfUnusableError, watermarkPdf } from "./pdf";
import { withStampSlot } from "./stamp-gate";

/**
 * تسليم ملفات PDF. الصلاحية والحساب يُفحصان قبل هذا الملف في كل طلب (checkFileAccess و getCurrentUser)،
 * ولا يُخزَّن ناتجهما. ما هنا يقرر فقط كيف تصل البايتات:
 *
 *  - ملف رئيسي لمشترٍ أو معلم والعلامة مفعلة: نسخة مختومة باسمه دائمًا، لا الأصل أبدًا.
 *    أول فتح يختمها (ضمن حد الختمات الجارية في stamp-gate.ts) ويحفظها في الحاوية الخاصة،
 *    والفتح التالي يبثها من التخزين دون تحميلها في الذاكرة ودون ختم جديد.
 *  - طلبات متزامنة للملف نفسه من الحساب نفسه على هذه النسخة تنتظر ختمًا واحدًا وتأخذ نتيجته.
 *    على نسخة خادم أخرى يمنع العقد في stamped_copies ختمًا ثانيًا، فيجاب الطلب 429 مع Retry-After.
 *  - المالك، أو العلامة معطلة: الأصل بثًا من التخزين.
 *  - المعاينة المجانية: نسخة واحدة في ذاكرة النسخة لكل ملف معاينة، والمتصفح يعيد استعمالها (ترويسات المسار).
 */

/** رقم شكل الختم: يتغير إذا تغير نصه أو موضعه في stampDocument، فلا تُعاد نسخة بالشكل القديم */
export const STAMP_FORMAT_VERSION = 2;
/** عقد الختم بين نسخ الخادم: أطول من مهلة الختم (90 ثانية) مع القراءة والحفظ */
export const STAMP_LEASE_SECONDS = 180;
/** النسخة المختومة تُحذف بعد هذه المدة بلا فتح (مهمة التنظيف اليومية). الرقم في سياسة الخصوصية */
export const STAMPED_COPY_IDLE_DAYS = 14;
/**
 * أقصى ما تشغله النسخ المختومة من التخزين. الخطة المجانية لـ Supabase فيها 1GB للمشروع كله مع المذكرات نفسها،
 * فلا تأخذ النسخ منها إلا القليل. ما زاد يُختم ويُسلَّم دون حفظ، والتنظيف اليومي يحذف الأقدم.
 */
export const STAMPED_CACHE_BUDGET_BYTES = { free: 150 * 1024 * 1024, paid: 25 * 1024 * 1024 * 1024 } as const;
/** انتظار نسخة خادم أخرى تختم الملف نفسه للحساب نفسه */
export const STAMP_IN_PROGRESS_RETRY_SECONDS = 5;
const MAX_JOINERS = 10;

/**
 * حدود فتح الملفات في كل 10 دقائق:
 * - للحساب: 40. القارئ يطلب الملف مرة لكل فتح، والتنزيل مرة، وإعادة المحاولة التلقائية عند الانشغال بضع مرات؛
 *   قارئ أمين على جهازين لا يصل إليها. الحد للحساب لا للعنوان، فصف كامل خلف عنوان واحد لا يُقفل.
 * - للزائر بلا حساب (المعاينات وحدها متاحة له): 120 لكل عنوان، فالمتصفح يعيد استعمال المعاينة ولا يطلبها مجددًا.
 */
export const FILE_OPEN_LIMITS = { perAccount: 40, perAnonymousIp: 120, windowSeconds: 10 * 60 } as const;


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

export type PdfBody = { body: ReadableStream<Uint8Array>; size: number | null };

type Lines = { primary: string; secondary: string };

export type WatermarkIdentity = { orderNumber: string | null; lines: Lines };

/**
 * بيانات العلامة المائية: بريد المشتري ورقم الطلب الذي منح الصلاحية وتاريخ دفعه، أو مرجع الحساب لمن لا طلب له.
 * ثابتة ما لم يتغير الطلب أو البريد، فتصلح مفتاحًا للنسخة المحفوظة (تاريخ اليوم كان يغيّرها كل يوم).
 */
export function identityLines(user: { id: string; email: string }, order: { number: string; paidAt: Date | string | null } | null): WatermarkIdentity {
  const ref = order?.number ?? `U-${user.id.slice(0, 8).toUpperCase()}`;
  const date = order?.paidAt ? new Date(order.paidAt).toISOString().slice(0, 10) : null;
  return {
    orderNumber: order?.number ?? null,
    lines: {
      primary: `${user.email}  ${ref}`,
      secondary: [`Licensed to ${user.email}`, ref, date, "Personal use only"].filter(Boolean).join(" | "),
    },
  };
}

/** مفتاح النسخة المختومة: الملف ونسخته، والحساب، ورقم الطلب، وكل ما يحدد شكل الختم ونصه */
export function stampCacheKey(input: { fileId: string; fileVersion: string; userId: string; orderNumber: string | null; lines: Lines; format?: number }): string {
  const parts = [input.format ?? STAMP_FORMAT_VERSION, input.fileId, input.fileVersion, input.userId, input.orderNumber ?? "", input.lines.primary, input.lines.secondary];
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

/** تحويل البايتات إلى Stream (الاستجابات المتدفقة لا تخضع لحد 4.5MB في Vercel) */
export function bytesToStream(bytes: Uint8Array, chunkSize = 256 * 1024): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      const end = Math.min(offset + chunkSize, bytes.length);
      controller.enqueue(bytes.subarray(offset, end));
      offset = end;
    },
  });
}

const fromBytes = (bytes: Uint8Array): PdfBody => ({ body: bytesToStream(bytes), size: bytes.length });

async function streamObject(key: string): Promise<PdfBody> {
  const { stream, size } = await storage().readStream("private", key);
  return { body: stream, size };
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

async function previewBody(file: DeliverableFile): Promise<PdfBody> {
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

type CopyRow = { id: string; cacheKey: string; objectKey: string; stale: boolean };

/** هوية العلامة والنسخ المحفوظة لهذا الحساب وهذا الملف بنسخته الحالية، في أمر واحد */
async function identityAndCopies(user: DeliveryUser, file: DeliverableFile) {
  const [row] = await sql<{ number: string | null; paid_at: Date | null; copies: CopyRow[] | null }[]>`
    select ord.number, ord.paid_at, cp.copies
    from (select 1) as one
    left join lateral (
      select o.number, o.paid_at from entitlements e join orders o on o.id = e.order_id
      where e.user_id = ${user.id} and e.revoked_at is null
        and (e.product_id = ${file.productId}
             or e.product_id in (select bundle_id from bundle_items where product_id = ${file.productId}))
      order by o.paid_at desc nulls last limit 1
    ) ord on true
    left join lateral (
      select json_agg(json_build_object('id', c.id, 'cacheKey', c.cache_key, 'objectKey', c.object_key, 'stale', c.last_used_at < now() - interval '1 day')) as copies
      from stamped_copies c
      where c.user_id = ${user.id} and c.file_id = ${file.id} and c.file_version = ${file.storageKey} and c.state = 'ready'
    ) cp on true
  `;
  const identity = identityLines(user, row?.number ? { number: row.number, paidAt: row.paid_at } : null);
  return { identity, copies: row?.copies ?? [] };
}

function cacheBudgetBytes(): number {
  return env().STORAGE_PLAN === "paid" ? STAMPED_CACHE_BUDGET_BYTES.paid : STAMPED_CACHE_BUDGET_BYTES.free;
}

type Claim = { kind: "mine"; id: string } | { kind: "ready"; objectKey: string } | { kind: "busy"; retryAfterSeconds: number };

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
  const [live] = await sql<{ state: string; object_key: string; seconds: number | null }[]>`
    select state, object_key, ceil(extract(epoch from lease_until - now()))::int as seconds
    from stamped_copies where cache_key = ${key} and state <> 'doomed'
  `;
  if (live?.state === "ready") return { kind: "ready", objectKey: live.object_key };
  return { kind: "busy", retryAfterSeconds: Math.min(30, Math.max(STAMP_IN_PROGRESS_RETRY_SECONDS, live?.seconds ?? STAMP_IN_PROGRESS_RETRY_SECONDS)) };
}

/** يحفظ النسخة إن بقي في الميزانية مكان. أي تعثر هنا لا يمنع تسليم ما خُتم: الحفظ تسريع لا شرط */
async function keepCopy(claimId: string, token: string, objectKey: string, bytes: Uint8Array): Promise<boolean> {
  const [{ used }] = await sql<{ used: string }[]>`select coalesce(sum(size_bytes), 0)::text as used from stamped_copies where state = 'ready'`;
  if (Number(used) + bytes.length > cacheBudgetBytes()) return false;
  try {
    await storage().put("private", objectKey, bytes, "application/pdf");
  } catch (err) {
    await reportError("files:stamped-copy-store", err);
    return false;
  }
  const done = await sql`
    update stamped_copies set state = 'ready', size_bytes = ${bytes.length}, holder = null, lease_until = null, last_used_at = now()
    where id = ${claimId} and holder = ${token} and state = 'stamping'
  `;
  // انتهى العقد قبل الحفظ وأخذه غيرنا: الكائن الذي رفعناه يُحذف مع الصف المعلَّم
  return done.count === 1;
}

type StampOutcome = { bytes: Uint8Array } | { objectKey: string };

async function stampAndKeep(key: string, user: DeliveryUser, file: DeliverableFile, lines: Lines): Promise<StampOutcome> {
  return withStampSlot(async () => {
    const token = randomUUID();
    const objectKey = `stamped/${randomUUID()}.pdf`;
    const claim = await claimStamping(key, user, file, token, objectKey);
    if (claim.kind === "ready") return { objectKey: claim.objectKey };
    if (claim.kind === "busy") throw new StampInProgressError(claim.retryAfterSeconds);
    let kept = false;
    try {
      const original = await storage().read("private", file.storageKey);
      if (original.length > STAMP_MAX_BYTES) throw new OverStampLimitError();
      const stamped = await watermarkPdf(original, lines);
      kept = await keepCopy(claim.id, token, objectKey, stamped);
      return { bytes: stamped };
    } finally {
      // لم يُحفظ: يُعلَّم الصف للحذف، والتنظيف يحذف كائنه إن كان قد رُفع
      if (!kept) await sql`update stamped_copies set state = 'doomed' where id = ${claim.id} and holder = ${token}`.catch((err) => reportError("files:stamped-copy-release", err));
    }
  });
}

/** ختم واحد لكل مفتاح على هذه النسخة: الطلبات المكررة تنتظر نتيجته */
const inflight = new Map<string, { promise: Promise<StampOutcome>; joiners: number }>();

export function stampingInFlight() {
  return inflight.size;
}

async function stampOnce(key: string, user: DeliveryUser, file: DeliverableFile, lines: Lines): Promise<StampOutcome> {
  const running = inflight.get(key);
  if (running) {
    if (running.joiners >= MAX_JOINERS) throw new StampInProgressError(STAMP_IN_PROGRESS_RETRY_SECONDS);
    running.joiners++;
    return running.promise;
  }
  const promise = stampAndKeep(key, user, file, lines).finally(() => inflight.delete(key));
  inflight.set(key, { promise, joiners: 0 });
  return promise;
}

async function stampedBody(user: DeliveryUser, file: DeliverableFile): Promise<PdfBody> {
  // ملف فوق الحد لا يُقرأ أصلًا. صفحاته تُعرف بعد الفتح أيضًا (watermarkPdf يرفض ما زاد)
  if (exceedsStampLimit(file)) throw new OverStampLimitError();
  const { identity, copies } = await identityAndCopies(user, file);
  const key = stampCacheKey({ fileId: file.id, fileVersion: file.storageKey, userId: user.id, orderNumber: identity.orderNumber, lines: identity.lines });
  const hit = copies.find((c) => c.cacheKey === key);
  if (hit) {
    try {
      const body = await streamObject(hit.objectKey);
      if (hit.stale) await sql`update stamped_copies set last_used_at = now() where id = ${hit.id}`.catch((err) => reportError("files:stamped-copy-touch", err));
      return body;
    } catch (err) {
      if (!(err instanceof StorageNotFoundError)) throw err;
      // الكائن ضاع من التخزين: يُعلَّم الصف ويُختم من جديد
      await sql`update stamped_copies set state = 'doomed' where id = ${hit.id}`;
    }
  }
  const outcome = await stampOnce(key, user, file, identity.lines);
  return "bytes" in outcome ? fromBytes(outcome.bytes) : streamObject(outcome.objectKey);
}

// ---------------------------------------------------------------------------- نقطة الدخول

/** يقرر ما يُسلَّم بعد أن فحص المسار الصلاحية. لا يعيد أصل ملف رئيسي لمشترٍ والعلامة مفعلة، أبدًا */
export async function openDeliverablePdf(file: DeliverableFile, user: DeliveryUser | null): Promise<PdfBody> {
  if (file.kind === "preview") return previewBody(file);
  if (!user) throw new Error("main file without a user");
  if (user.role === "admin") return streamObject(file.storageKey);
  const settings = await getSettings();
  if (!settings.watermark_enabled) {
    // بلا ختم لا يمر الملف بأي فحص: ملف قديم محمي بكلمة مرور يُكتشف هنا، فيُعلَّم ويقال للطالب الصدق
    if (file.checkStatus === "unchecked" && file.sizeBytes <= STAMP_MAX_BYTES) {
      await withStampSlot(async () => getPdfPageCount(await storage().read("private", file.storageKey)));
    }
    return streamObject(file.storageKey);
  }
  return stampedBody(user, file);
}

// ---------------------------------------------------------------------------- الحذف

/**
 * يعلّم نسخ حساب للحذف (حذف بيانات الطالب). داخل معاملة الحذف نفسها، فلا تُستعمل بعدها أبدًا،
 * والكائنات تُحذف بعد المعاملة (sweepDoomedCopies) أو في التنظيف اليومي إن تعثر ذلك.
 */
export async function doomUserCopies(userId: string, db: Db = sql): Promise<number> {
  return (await db`update stamped_copies set state = 'doomed' where user_id = ${userId} and state <> 'doomed'`).count;
}

/** نسخ ملف حُذف أو استُبدل: لا يمكن أن تُستعمل بعد الآن */
export async function doomFileCopies(fileIds: string[]): Promise<number> {
  if (fileIds.length === 0) return 0;
  return (await sql`update stamped_copies set state = 'doomed' where file_id = any(${fileIds}::uuid[]) and state <> 'doomed'`).count;
}

/** يحذف كائنات النسخ المعلَّمة ثم صفوفها. ما فشل حذفه يبقى معلَّمًا للجولة التالية */
export async function sweepDoomedCopies(limit = 100): Promise<number> {
  const rows = await sql<{ id: string; object_key: string }[]>`
    select id, object_key from stamped_copies where state = 'doomed' order by last_used_at limit ${limit}
  `;
  if (rows.length === 0) return 0;
  await storage().removeMany(
    "private",
    rows.map((r) => r.object_key),
  );
  const ids = rows.map((r) => r.id);
  return (await sql`delete from stamped_copies where id = any(${ids}::uuid[]) and state = 'doomed'`).count;
}
