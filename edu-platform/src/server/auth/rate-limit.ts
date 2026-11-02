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

export async function pruneRateLimits() {
  await sql`delete from rate_limits where reset_at < now() - interval '1 day'`;
}
