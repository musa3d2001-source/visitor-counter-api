import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { env } from "../env";

/** Vercel يوصي بسر عشوائي من ١٦ حرفًا على الأقل، والأقصر من ذلك لا يُقبل */
const MIN_SECRET_LENGTH = 16;

const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();

/**
 * التحقق من استدعاء Cron: Vercel يرسل Authorization: Bearer <CRON_SECRET>.
 * غياب السر يعني الرفض دائمًا، لا السماح. المقارنة على البصمات حتى يتساوى طول المقارنة وتبقى ثابتة الزمن.
 */
export function isCronAuthorized(authorization: string | null): boolean {
  const secret = env().CRON_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) return false;
  return timingSafeEqual(digest(authorization ?? ""), digest(`Bearer ${secret}`));
}
