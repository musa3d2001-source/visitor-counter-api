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
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
