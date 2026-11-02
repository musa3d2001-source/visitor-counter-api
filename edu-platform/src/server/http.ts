import "server-only";
import { headers } from "next/headers";
import { env } from "./env";

/** عنوان IP للعميل (من رؤوس الوكيل الموثوق في Vercel) */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return ipFromHeaders(h);
}

export function ipFromHeaders(h: Headers): string {
  if (env().TRUST_PROXY) {
    const fwd = h.get("x-forwarded-for");
    if (fwd) return fwd.split(",")[0]!.trim().slice(0, 64);
    const real = h.get("x-real-ip");
    if (real) return real.trim().slice(0, 64);
  }
  return "unknown";
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
