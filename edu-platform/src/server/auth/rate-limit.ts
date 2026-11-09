import "server-only";
import { sql } from "../db";

/**
 * تحديد معدل المحاولات بنافذة زمنية ثابتة، مخزّن في قاعدة البيانات
 * (يعمل عبر عدة نسخ خادم دون Redis).
 */
export async function hitRateLimit(key: string, limit: number, windowSeconds: number) {
  const [row] = await sql<{ count: number; reset_at: Date }[]>`
    insert into rate_limits (key, count, reset_at)
    values (${key}, 1, now() + make_interval(secs => ${windowSeconds}))
    on conflict (key) do update set
      count = case when rate_limits.reset_at < now() then 1 else rate_limits.count + 1 end,
      reset_at = case when rate_limits.reset_at < now() then now() + make_interval(secs => ${windowSeconds}) else rate_limits.reset_at end
    returning count, reset_at
  `;
  return {
    allowed: row.count <= limit,
    remaining: Math.max(0, limit - row.count),
    retryAfterSeconds: Math.max(0, Math.ceil((new Date(row.reset_at).getTime() - Date.now()) / 1000)),
  };
}

export async function peekRateLimit(key: string, limit: number) {
  const [row] = await sql<{ count: number; reset_at: Date }[]>`
    select count, reset_at from rate_limits where key = ${key} and reset_at > now()
  `;
  if (!row) return { blocked: false, retryAfterSeconds: 0 };
  return {
    blocked: row.count >= limit,
    retryAfterSeconds: Math.max(0, Math.ceil((new Date(row.reset_at).getTime() - Date.now()) / 1000)),
  };
}

export async function clearRateLimit(key: string) {
  await sql`delete from rate_limits where key = ${key}`;
}

export type FailurePolicy = {
  /** عدد الإخفاقات المسموحة بلا تأخير */
  freeFailures: number;
  /** الانتظار بعد آخر إخفاق مسموح، ويتضاعف مع كل إخفاق تالٍ */
  firstDelaySeconds: number;
  maxDelaySeconds: number;
  /** تُنسى الإخفاقات بعد هذه المدة بلا محاولات */
  forgetAfterSeconds: number;
};

export type FailureSlot = { allowed: true; failures: number } | { allowed: false; retryAfterSeconds: number };

/**
 * يحجز محاولة قبل فحص السر، بتأخير متصاعد. عند نجاح الفحص يُمسح المفتاح بـ clearRateLimit، فالنجاح لا يُحتسب.
 * الحجز ذري: طلبات متوازية لا تتجاوز الحد، والمحاولة المرفوضة لا تطيل الانتظار.
 * وقت آخر محاولة = reset_at - forgetAfterSeconds، فلا حاجة لعمود جديد.
 */
export async function reserveFailureSlot(key: string, policy: FailurePolicy): Promise<FailureSlot> {
  const { freeFailures: free, firstDelaySeconds: first, maxDelaySeconds: max, forgetAfterSeconds: forget } = policy;
  const [row] = await sql<{ count: number }[]>`
    insert into rate_limits as r (key, count, reset_at)
    values (${key}, 1, now() + make_interval(secs => ${forget}))
    on conflict (key) do update set
      count = case when r.reset_at <= now() then 1 else r.count + 1 end,
      reset_at = now() + make_interval(secs => ${forget})
    where r.reset_at <= now()
      or r.count < ${free}::int
      or now() >= r.reset_at - make_interval(secs => ${forget})
        + make_interval(secs => least(${first}::double precision * power(2::double precision, least(r.count - ${free}::int, 20)), ${max}::double precision))
    returning count
  `;
  if (row) return { allowed: true, failures: row.count };
  const [wait] = await sql<{ seconds: number }[]>`
    select greatest(1, ceil(extract(epoch from (
      r.reset_at - make_interval(secs => ${forget})
        + make_interval(secs => least(${first}::double precision * power(2::double precision, least(r.count - ${free}::int, 20)), ${max}::double precision))
        - now()
    ))))::int as seconds
    from rate_limits r where r.key = ${key}
  `;
  return { allowed: false, retryAfterSeconds: wait?.seconds ?? first };
}

/**
 * يحذف دفعة محدودة من الحدود المنتهية منذ يوم على الأقل، ويعيد عدد ما حذف.
 * الدفعة MATERIALIZED تُحسب مرة واحدة: داخل IN قد يعيد المخطط تنفيذها لكل صف، فيتخطى القفل ما حذفه الأمر نفسه ويتجاوز الحد.
 */
export async function pruneRateLimits(batchSize: number): Promise<number> {
  const { count } = await sql`
    with batch as materialized (
      select key from rate_limits where reset_at < now() - interval '1 day' limit ${batchSize} for update skip locked
    )
    delete from rate_limits r using batch where r.key = batch.key
  `;
  return count;
}
