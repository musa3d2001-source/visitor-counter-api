import "server-only";
import { headers } from "next/headers";
import { env, isVercelDeployment } from "./env";

/** عنوان IP للعميل (من رؤوس الوكيل الموثوق في Vercel) */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return ipFromHeaders(h);
}

function clean(value: string | null | undefined): string | null {
  const v = value?.trim().slice(0, 64);
  return v ? v : null;
}

function lastEntry(list: string | null): string | null {
  if (!list) return null;
  const parts = list.split(",").map((p) => p.trim()).filter(Boolean);
  return clean(parts[parts.length - 1]);
}

/**
 * عنوان الزائر لحدود المحاولات وسجلات الوصول. مصدر واحد لكل الكود.
 *  - TRUST_PROXY معطل: لا نثق بأي ترويسة ("unknown").
 *  - على Vercel: x-vercel-forwarded-for ثم x-real-ip ثم x-forwarded-for. Vercel يكتب هذه الثلاث بنفسه بعنوان من اتصل به
 *    ولا يمرر قيمة أرسلها الزائر، وx-vercel-forwarded-for يبقى صحيحًا حتى لو وُضع وكيل آخر أمام Vercel.
 *  - خارج Vercel (خلف وكيل عادي، أو أداة اختبار الضغط محليًا): آخر قيمة في X-Forwarded-For فقط، وهي ما أضافه الوكيل
 *    الذي يتصل بنا مباشرة. أول قيمة يكتبها الزائر بنفسه، فلا تُستعمل أبدًا.
 */
export function ipFromHeaders(h: Headers): string {
  const e = env();
  if (!e.TRUST_PROXY) return "unknown";
  if (isVercelDeployment(e)) {
    return clean(lastEntry(h.get("x-vercel-forwarded-for"))) ?? clean(h.get("x-real-ip")) ?? lastEntry(h.get("x-forwarded-for")) ?? "unknown";
  }
  return lastEntry(h.get("x-forwarded-for")) ?? clean(h.get("x-real-ip")) ?? "unknown";
}

export async function userAgent(): Promise<string> {
  const h = await headers();
  return (h.get("user-agent") ?? "").slice(0, 300);
}

/**
 * حماية CSRF لمسارات API التي تعدّل البيانات وتعتمد على الكوكي:
 * يجب أن يطابق Origin (أو Referer) نطاق التطبيق.
 * (Server Actions محمية تلقائيًا في Next.js بمقارنة Origin مع Host)
 */
export function isSameOriginRequest(req: Request): boolean {
  const origin = req.headers.get("origin") ?? req.headers.get("referer");
  if (!origin) return false;
  try {
    const o = new URL(origin);
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    const appHost = new URL(env().APP_URL).host;
    return o.host === host || o.host === appHost;
  } catch {
    return false;
  }
}
