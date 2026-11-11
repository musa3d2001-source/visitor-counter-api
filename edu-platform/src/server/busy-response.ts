import "server-only";
import { DB_BUSY_MESSAGE, DB_BUSY_RETRY_AFTER_SECONDS, DB_BUSY_TITLE, DB_MAINTENANCE_MESSAGE, DB_MAINTENANCE_RETRY_AFTER_SECONDS, DB_MAINTENANCE_TITLE } from "@/lib/busy";
import { INLINE_PAGE_CSP } from "@/lib/security-headers";
import { isDatabaseBusy, isSchemaNotReady } from "./db-busy";
import { reportError } from "./platform/report-error";

/**
 * رد «المنصة مشغولة» الموحد لمسارات API: 503 مع Retry-After، بلا أي تفصيل من الخادم.
 * html لمسارات يفتحها المتصفح مباشرة (العودة من الدفع): صفحة صغيرة تعيد المحاولة وحدها بعد ثوانٍ، فتعيد التحقق من البوابة.
 * err من نوع SchemaNotReadyError (ترحيل ناقص، F26): الرد نفسه بنص «قيد التحديث» ومهلة أطول، و maintenance: true.
 */
export function busyResponse(kind: "json" | "html" = "json", err?: unknown): Response {
  const maintenance = err !== undefined && isSchemaNotReady(err);
  const retryAfter = maintenance ? DB_MAINTENANCE_RETRY_AFTER_SECONDS : DB_BUSY_RETRY_AFTER_SECONDS;
  const title = maintenance ? DB_MAINTENANCE_TITLE : DB_BUSY_TITLE;
  const message = maintenance ? DB_MAINTENANCE_MESSAGE : DB_BUSY_MESSAGE;
  const headers = { "retry-after": String(retryAfter), "cache-control": "no-store" };
  if (kind === "json") return Response.json(maintenance ? { error: message, busy: true, maintenance: true } : { error: message, busy: true }, { status: 503, headers });
  const page = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="${retryAfter}"><title>${title}</title></head><body style="font-family:system-ui,sans-serif;background:#fff8ec;color:#172026;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px;box-sizing:border-box;text-align:center"><main><h1 style="font-size:1.6rem">${title}</h1><p style="font-size:1.05rem;line-height:1.9">${message}</p><p style="font-size:.95rem">تُعاد المحاولة تلقائيًا بعد لحظات.</p></main></body></html>`;
  return new Response(page, { status: 503, headers: { ...headers, "content-type": "text/html; charset=utf-8", "content-security-policy": INLINE_PAGE_CSP } });
}

/**
 * يلف معالج مسار: انشغال قاعدة البيانات يصير 503 مع Retry-After، وأي خطأ آخر يمر كما هو.
 * يُسجل للمالك بحدود سجل الأخطاء نفسه (صف واحد مكرر في الدقيقة لكل نسخة) دون أن ينتظره الرد.
 * الترحيل الناقص لا يُسجل هنا: سجل الأخطاء نفسه في قاعدة البيانات المرفوضة، وحارس db.ts يكتبه في سجل الخادم مرة.
 */
export function withBusyGuard<A extends unknown[], R extends Response>(handler: (...args: A) => Promise<R>, kind: "json" | "html" = "json"): (...args: A) => Promise<R | Response> {
  return async (...args: A) => {
    try {
      return await handler(...args);
    } catch (err) {
      if (!isDatabaseBusy(err)) throw err;
      if (!isSchemaNotReady(err)) void reportError("db:busy", err);
      return busyResponse(kind, err);
    }
  };
}
