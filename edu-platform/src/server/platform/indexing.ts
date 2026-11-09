import "server-only";
import { env } from "../env";

/** المسارات الخاصة التي لا تُزحف حتى على النطاق الحقيقي */
export const PRIVATE_PATHS = ["/admin", "/api/", "/library", "/read/", "/preview/", "/watch/", "/account", "/orders/", "/checkout", "/cart", "/payment/"];

/**
 * هل يجوز لمحركات البحث فهرسة هذا النشر؟ رابط vercel.app مؤقت ولا يُفهرس أبدًا،
 * فيسبق أي ضبط آخر حتى لا تظهر النسخة التجريبية في نتائج البحث بدل النطاق الحقيقي.
 */
export function siteIndexable(): boolean {
  const e = env();
  if (!e.SITE_INDEXABLE) return false;
  const host = new URL(e.APP_URL).hostname.toLowerCase();
  return host !== "vercel.app" && !host.endsWith(".vercel.app");
}
