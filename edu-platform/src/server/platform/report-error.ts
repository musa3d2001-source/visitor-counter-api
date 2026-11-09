import "server-only";
import { createHash } from "node:crypto";
import { scrubForOps, scrubStack } from "@/lib/redact";
import { sql } from "../db";
import { alertAfterResponse } from "./ops-alerts";

/**
 * تسجيل الأخطاء بلا مزود مدفوع. يُكتب في error_events ويراه المالك في «صحة المنصة».
 *
 * محدود: صف واحد لكل خطأ متكرر، و٥٠٠ صف على الأكثر، و٦٠ كتابة في الدقيقة لكل نسخة خادم.
 * لا يرمي أبدًا ولا يعلّق: مسار الفشل لا يصح أن يصنع فشلًا ثانيًا، وعند تعطل قاعدة البيانات يتوقف عن المحاولة ٣٠ ثانية.
 * لا يستقبل إلا الخطأ نفسه: لا بيانات الطلب ولا ترويساته، ورابط الطلب لا يُخزن لأنه قد يحمل رمزًا. نخزن نمط المسار فقط.
 */
const MAX_ROWS = 500;
const MAX_WRITES_PER_MINUTE = 60;
const WRITE_TIMEOUT_MS = 3_000;
const BREAKER_MS = 30_000;
/** خطأ قديم عاد بعد هذا الهدوء يستحق رسالة جديدة */
const QUIET_HOURS_BEFORE_NEW_ALERT = 24;

let windowStartedAt = 0;
let writesThisWindow = 0;
let breakerUntil = 0;

export function resetErrorReporterForTests() {
  windowStartedAt = 0;
  writesThisWindow = 0;
  breakerUntil = 0;
}

function withinBudget(now: number): boolean {
  if (now < breakerUntil) return false;
  if (now - windowStartedAt > 60_000) {
    windowStartedAt = now;
    writesThisWindow = 0;
  }
  writesThisWindow++;
  return writesThisWindow <= MAX_WRITES_PER_MINUTE;
}

function describeError(err: unknown): { message: string; stack: string | null; digest: string | null } {
  const rawDigest = typeof err === "object" && err !== null ? (err as { digest?: unknown }).digest : undefined;
  const digest = typeof rawDigest === "string" && /^[\w-]{1,64}$/.test(rawDigest) ? rawDigest : null;
  if (err instanceof Error) {
    const code = (err as { code?: unknown }).code;
    // اسم الصنف في بناء الإنتاج مختصر إلى حرف أو حرفين ولا يفيد أحدًا
    const label = [err.name !== "Error" && err.name.length > 2 ? err.name : "", typeof code === "string" && code.length <= 12 ? code : ""].filter(Boolean).join(" ");
    return { message: scrubForOps(label ? `${label}: ${err.message}` : err.message) || "خطأ بلا رسالة", stack: scrubStack(err.stack), digest };
  }
  // كائن غير Error قد يحمل أي شيء، فلا نحوله إلى نص
  return { message: typeof err === "string" ? scrubForOps(err) || "خطأ بلا رسالة" : "خطأ من نوع غير معروف", stack: null, digest };
}

/** الأرقام تختلف بين تكرارات الخطأ نفسه (مدد، أرقام منافذ)، فلا تدخل البصمة */
function fingerprintOf(source: string, route: string | null, message: string): string {
  return createHash("sha256").update(`${source}|${route ?? ""}|${message.replace(/\d+/g, "#")}`).digest("hex");
}

/** true إن كان الخطأ جديدًا أو عاد بعد هدوء طويل، أي يستحق تنبيهًا */
async function write(fingerprint: string, source: string, route: string | null, details: ReturnType<typeof describeError>): Promise<boolean> {
  const [row] = await sql<{ previous_seen: Date | null }[]>`
    with prev as (select last_seen_at from error_events where fingerprint = ${fingerprint})
    insert into error_events as e (fingerprint, source, route, message, digest, stack)
    values (${fingerprint}, ${source}, ${route}, ${details.message}, ${details.digest}, ${details.stack})
    on conflict (fingerprint) do update set
      occurrences = least(e.occurrences, 2000000000) + 1,
      last_seen_at = now(),
      digest = coalesce(excluded.digest, e.digest),
      stack = coalesce(excluded.stack, e.stack)
    returning (select last_seen_at from prev) as previous_seen
  `;
  if (row.previous_seen === null) {
    await sql`delete from error_events where id in (select id from error_events order by last_seen_at desc, id desc offset ${MAX_ROWS})`;
    return true;
  }
  return row.previous_seen.getTime() < Date.now() - QUIET_HOURS_BEFORE_NEW_ALERT * 3600_000;
}

/** يسجل الخطأ وينبه المالك عند ظهور خطأ جديد. آمن للاستدعاء من أي مسار فشل، ويكتفي بسطر منقّى في سجل الخادم */
export async function reportError(source: string, err: unknown, ctx: { route?: string | null } = {}): Promise<void> {
  try {
    const details = describeError(err);
    const label = source.slice(0, 64);
    const route = ctx.route ? scrubForOps(ctx.route, 200) : null;
    console.error(`[ops:${label}]`, route ?? "", details.message);
    if (!withinBudget(Date.now())) return;
    let timer: ReturnType<typeof setTimeout>;
    const timedOut = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), WRITE_TIMEOUT_MS);
      timer.unref?.();
    });
    const outcome = await Promise.race([write(fingerprintOf(label, route, details.message), label, route, details), timedOut]).finally(() => clearTimeout(timer));
    if (outcome === "timeout") {
      breakerUntil = Date.now() + BREAKER_MS;
      return;
    }
    if (outcome) await alertAfterResponse("server_error");
  } catch (failure) {
    breakerUntil = Date.now() + BREAKER_MS;
    console.error("[ops] could not record an error", failure instanceof Error ? failure.name : "unknown");
  }
}

type RequestErrorContext = { routePath?: string; routeType?: string };

/** ما يرميه Next عمدًا (redirect و notFound) أو انقطاع الزائر ليس خطأ في الموقع */
function isExpectedSignal(err: unknown): boolean {
  const digest = typeof err === "object" && err !== null ? (err as { digest?: unknown }).digest : undefined;
  if (typeof digest === "string" && /^(NEXT_|DYNAMIC_SERVER_USAGE|BAILOUT_TO_CLIENT_SIDE_RENDERING)/.test(digest)) return true;
  return err instanceof Error && (err.name === "AbortError" || err.message === "aborted" || (err as NodeJS.ErrnoException).code === "ECONNRESET");
}

/** من onRequestError: نأخذ نمط المسار فقط، مثل /api/files/[fileId]، ولا نقرأ الرابط الفعلي ولا الترويسات */
export async function reportRequestError(err: unknown, context: RequestErrorContext): Promise<void> {
  if (isExpectedSignal(err)) return;
  await reportError(`request:${context.routeType ?? "unknown"}`, err, { route: context.routePath ?? null });
}

export type ErrorEventRow = { id: string; source: string; route: string | null; message: string; digest: string | null; stack: string | null; occurrences: number; first_seen_at: Date; last_seen_at: Date };

export async function listErrorEvents(limit = 100): Promise<ErrorEventRow[]> {
  return sql<ErrorEventRow[]>`
    select id::text, source, route, message, digest, stack, occurrences, first_seen_at, last_seen_at
    from error_events order by last_seen_at desc, id desc limit ${limit}
  `;
}
