import "server-only";
import { after } from "next/server";
import { observeDatabaseBusy, type BusyReason } from "../db-busy";

/**
 * عدّادات الضغط: كم مرة امتلأ شيء فرفضنا طلبًا أو انتهت مهلته. يراها المالك في «صحة المنصة» ليعرف متى يحتاج إلى ترقية.
 * أنواع ثابتة وأعداد فقط، في صف لكل ساعة: لا حساب ولا عنوان ولا مسار ولا نص خطأ، فلا مكان فيها لبيانات شخصية.
 *
 * تُجمع في ذاكرة النسخة وتُكتب بأمر واحد: أول حدث فور انتهاء الرد، ثم مرة كل ٣٠ ثانية على الأكثر، فتحت الضغط لا تزيد الضغط.
 * العدّاد لا يرمي أبدًا ولا يعلّق طلبًا، وإن فشلت الكتابة يبقى ما جمعه ويتوقف عن المحاولة ٣٠ ثانية.
 * الأرقام تقريبية: نسخة أغلقتها المنصة قبل كتابتها تفقد آخر ثوانيها. يكفي هذا لمعرفة حجم الضغط، وليس سجلًا محاسبيًا.
 */
export const SATURATION_KINDS = ["login_shed", "stamp_shed", "stamp_deadline", "db_pool_wait", "db_deadline"] as const;
export type SaturationKind = (typeof SATURATION_KINDS)[number];

export const SATURATION_RETENTION_DAYS = 14;
const FLUSH_EVERY_MS = 30_000;
const WRITE_TIMEOUT_MS = 3_000;
const BREAKER_MS = 30_000;
/** after قد لا تنفذ (طلب انتهى قبلها): كتابة حُجزت منذ هذه المدة تُعد ضائعة، فلا يتوقف العدّاد إلى الأبد */
const STUCK_CLAIM_MS = 60_000;

const pending = new Map<SaturationKind, number>();
let lastWriteAt = Number.NEGATIVE_INFINITY;
let breakerUntil = 0;
let claimedAt: number | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

/** holdWrites: كأن كتابة حدثت للتو، فتبقى الأعداد في الذاكرة ليقرأها الاختبار */
export function resetSaturationForTests(opts: { holdWrites?: boolean } = {}) {
  pending.clear();
  lastWriteAt = opts.holdWrites ? Date.now() : Number.NEGATIVE_INFINITY;
  breakerUntil = 0;
  claimedAt = null;
  if (timer) clearTimeout(timer);
  timer = null;
}

export function pendingSaturation(): Partial<Record<SaturationKind, number>> {
  return Object.fromEntries(pending) as Partial<Record<SaturationKind, number>>;
}

/** حدث ضغط واحد. آمن من أي مسار، ولا ينتظر شيئًا */
export function noteSaturation(kind: SaturationKind): void {
  try {
    pending.set(kind, (pending.get(kind) ?? 0) + 1);
    schedule();
  } catch {
    // العدّاد لا يصنع فشلًا ثانيًا في مسار فشل
  }
}

function schedule(): void {
  const now = Date.now();
  if (timer || (claimedAt !== null && now - claimedAt < STUCK_CLAIM_MS)) return;
  const dueAt = Math.max(lastWriteAt + FLUSH_EVERY_MS, breakerUntil);
  if (now >= dueAt) {
    claimedAt = now;
    try {
      // بعد الرد: لا يطيل زمن الطلب، و Vercel يبقي الدالة حية حتى ينتهي
      after(() => flushSaturation());
    } catch {
      // خارج سياق طلب (مؤقت، اختبار)
      void flushSaturation();
    }
    return;
  }
  timer = setTimeout(() => {
    timer = null;
    void flushSaturation();
  }, dueAt - now);
  timer.unref?.();
}

async function write(entries: [SaturationKind, number][]): Promise<void> {
  // استيراد عند الحاجة: db.ts يحمّل هذا الملف ليسجل المراقب أدناه
  const { sql } = await import("../db");
  const kinds = entries.map(([kind]) => kind);
  const counts = entries.map(([, n]) => String(n));
  await sql`
    insert into saturation_counters as c (hour, kind, count)
    select date_trunc('hour', now()), k, n::bigint from unnest(${kinds}::text[], ${counts}::text[]) as t(k, n)
    on conflict (hour, kind) do update set count = c.count + excluded.count
  `;
}

export async function flushSaturation(): Promise<void> {
  const entries = [...pending];
  pending.clear();
  claimedAt = Date.now();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    if (entries.length) {
      const expired = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("timeout")), WRITE_TIMEOUT_MS);
        timeout.unref?.();
      });
      await Promise.race([write(entries), expired]);
    }
    lastWriteAt = Date.now();
  } catch {
    for (const [kind, n] of entries) pending.set(kind, (pending.get(kind) ?? 0) + n);
    breakerUntil = Date.now() + BREAKER_MS;
  } finally {
    clearTimeout(timeout);
    claimedAt = null;
    if (pending.size) schedule();
  }
}

/** من يعرّف الانتظار والمهلة: الأول لا اتصال متاح، والثاني أمر بدأ ولم ينتهِ في مهلته. رفض التجزئة تعدّه البوابة نفسها */
const BUSY_KIND: Record<BusyReason, SaturationKind | null> = {
  queue: "db_pool_wait",
  connect: "db_pool_wait",
  unavailable: "db_pool_wait",
  statement: "db_deadline",
  idle_in_transaction: "db_deadline",
  hash: null,
};

observeDatabaseBusy((reason) => {
  const kind = BUSY_KIND[reason];
  if (kind) noteSaturation(kind);
});
