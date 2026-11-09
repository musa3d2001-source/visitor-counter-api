import { createHmac } from "node:crypto";
import { constantTimeEqual, deriveKey } from "./two-factor-core";

/**
 * (نواة بدون server-only لاستخدامها في الاختبارات)
 * إثبات أن هذا المتصفح أدخل كلمة المرور الصحيحة لهذا الحساب من قبل (Device Cookie حسب توصية OWASP).
 *
 * المشكلة: حد ١٠٠ حساب فاشل لكل IP يوقف تجربة كلمة واحدة على قائمة حسابات، لكنه يوقف معها فصلًا كاملًا
 * خلف عنوان مدرسة واحد. ولا يصح أن تتجاوزه كلمة المرور الصحيحة، لأن ذلك يلغي الحد: المهاجم يجرب حتى تصح.
 * الإثبات يتجاوز حظر الشبكة فقط، ولحساب واحد فقط، وقد سبق لهذا المتصفح أن أثبت كلمته.
 * حد الزوج (حساب + IP) يبقى كما هو، وكلمة المرور تُفحص كالعادة.
 */
export const DEVICE_PROOF_DAYS = 90;

const KEY_LABEL = "login-device-proof";

function mac(email: string, expires: string, appSecret: string) {
  return createHmac("sha256", deriveKey(appSecret, KEY_LABEL)).update(`${email.toLowerCase()}|${expires}`).digest("base64url");
}

export function issueDeviceProof(email: string, appSecret: string, nowMs = Date.now()): string {
  const expires = String(Math.floor(nowMs / 1000) + DEVICE_PROOF_DAYS * 86400);
  return `${expires}.${mac(email, expires, appSecret)}`;
}

export function verifyDeviceProof(proof: string | undefined, email: string, appSecret: string, nowMs = Date.now()): boolean {
  if (!proof || proof.length > 120) return false;
  const parts = proof.split(".");
  if (parts.length !== 2 || !/^\d{1,12}$/.test(parts[0]!)) return false;
  if (Number(parts[0]) * 1000 <= nowMs) return false;
  return constantTimeEqual(parts[1]!, mac(email, parts[0]!, appSecret));
}
