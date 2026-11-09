import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const arDate = new Intl.DateTimeFormat("ar-KW-u-nu-latn", { dateStyle: "medium", timeZone: "Asia/Kuwait" });
const arDateTime = new Intl.DateTimeFormat("ar-KW-u-nu-latn", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kuwait",
});

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return arDate.format(new Date(d));
}

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return arDateTime.format(new Date(d));
}

/** تحويل نص إلى slug لاتيني آمن للروابط */
export function slugify(input: string): string {
  const s = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return s.slice(0, 80);
}

export function randomSuffix(len = 6): string {
  const chars = "abcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  for (const n of arr) out += chars[n % chars.length];
  return out;
}

/** التحقق من أن مسار إعادة التوجيه داخلي (منع Open Redirect) */
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next || typeof next !== "string") return fallback;
  // المتصفح يحذف التاب وفواصل الأسطر ويعامل \ كـ / قبل قراءة الرابط، فتصير /<tab>/evil.example رابطًا لموقع آخر
  if (!next.startsWith("/") || /[\u0000-\u001f\u007f\\]/.test(next)) return fallback;
  let url: URL;
  try {
    url = new URL(next, "http://n");
  } catch {
    return fallback;
  }
  if (url.protocol !== "http:" || url.host !== "n") return fallback;
  const out = url.pathname + url.search + url.hash;
  // /a/../..//evil.example تصير //evil.example بعد تطبيع المسار
  return out.startsWith("//") ? fallback : out;
}
